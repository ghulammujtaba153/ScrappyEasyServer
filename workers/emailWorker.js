import emailQueue from '../queues/emailQueue.js';
import EmailEvent from '../models/EmailEvent.js';
import Contact from '../models/Contact.js';
import ColdCampaign from '../models/ColdCampaign.js';
import { sendEmail, interpolate, buildHtml } from '../utils/emailSender.js';
import { canSendToday } from '../services/emailAccountService.js';
import EmailAccount from '../models/EmailAccount.js';
import { getNextValidTime } from '../utils/scheduleTime.js';
import { reserveAccountSlot } from '../utils/accountScheduleSlots.js';
import {
  EMAIL_WORKER_CONCURRENCY,
  EMAIL_ACCOUNT_RATE_LIMIT_MS,
  EMAIL_JOB_OPTS,
} from '../config/emailQueueConfig.js';
import Redis from 'ioredis';

const redisOptions = {
  maxRetriesPerRequest: null,
  lazyConnect: false,
  connectTimeout: 30000,
  retryStrategy: (times) => Math.min(times * 100, 3000),
};

if (process.env.REDIS_URL && (process.env.REDIS_URL.startsWith('rediss://') || process.env.REDIS_URL.includes('upstash.io'))) {
  redisOptions.tls = { rejectUnauthorized: false };
}

const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', redisOptions);
redis.on('error', (err) => console.error('[emailWorker] Redis error:', err.message));

async function getCachedModel(model, id, prefix) {
  const key = `cache:${prefix}:${id}`;
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.error(`[emailWorker] Cache read error for ${prefix}:${id}:`, err.message);
  }

  const doc = await model.findById(id).lean();
  if (doc) {
    try {
      await redis.setex(key, 30, JSON.stringify(doc));
    } catch (err) {
      console.error(`[emailWorker] Cache write error for ${prefix}:${id}:`, err.message);
    }
  }
  return doc;
}

async function delayJob(job, delayMs) {
  const safeDelay = Math.max(1000, delayMs);
  try {
    await job.moveToDelayed(Date.now() + safeDelay);
  } catch (queueErr) {
    await emailQueue.add(job.data, {
      jobId: job.data.eventId,
      delay: safeDelay,
      ...EMAIL_JOB_OPTS,
    });
  }
}

async function tryClaimAccountRateLimit(accountId) {
  const rateLimitKey = `ratelimit:account:${accountId}`;
  try {
    const claimed = await redis.set(rateLimitKey, '1', 'PX', EMAIL_ACCOUNT_RATE_LIMIT_MS, 'NX');
    if (claimed === 'OK') return true;

    const ttl = await redis.pttl(rateLimitKey);
    return { blocked: true, delayMs: ttl > 0 ? ttl : EMAIL_ACCOUNT_RATE_LIMIT_MS };
  } catch (err) {
    console.error(`[emailWorker] Rate limit claim failed for ${accountId}:`, err.message);
    return true;
  }
}

async function releaseAccountRateLimit(accountId) {
  try {
    await redis.del(`ratelimit:account:${accountId}`);
  } catch (err) {
    console.error(`[emailWorker] Rate limit release failed for ${accountId}:`, err.message);
  }
}

emailQueue.process(EMAIL_WORKER_CONCURRENCY, async (job) => {
  const { eventId } = job.data;

  const event = await EmailEvent.findById(eventId);
  if (!event || event.status === 'sent') return;

  const contact = await Contact.findById(event.contactId);
  const campaign = await getCachedModel(ColdCampaign, event.campaignId, 'campaign');
  const statusDoc = await ColdCampaign.findById(event.campaignId).select('status').lean();
  if (campaign && statusDoc) campaign.status = statusDoc.status;
  const account = await EmailAccount.findById(event.accountId);

  if (!campaign || !account) return;

  if (campaign.status === 'paused') {
    console.log(`[emailWorker] Campaign ${campaign._id} paused, delaying event ${eventId} by 1 hour.`);
    await emailQueue.add(job.data, {
      jobId: eventId,
      delay: 60 * 60 * 1000,
      ...EMAIL_JOB_OPTS,
    });
    return;
  }
  if (campaign.status !== 'active') {
    console.log(`[emailWorker] Campaign ${campaign._id} is ${campaign.status}, skipping event ${eventId}.`);
    return;
  }

  const rateClaim = await tryClaimAccountRateLimit(account._id);
  if (rateClaim !== true) {
    console.log(`[emailWorker] Rate limit hit for account ${account._id}. Re-queuing ${eventId} with delay ${rateClaim.delayMs}ms.`);
    await delayJob(job, rateClaim.delayMs);
    return;
  }

  const step = campaign.steps[event.stepIndex];

  if (step.sendCondition === 'no_reply' && event.stepIndex > 0) {
    const prevEvent = await EmailEvent.findOne({ campaignId: campaign._id, contactId: contact._id, stepIndex: event.stepIndex - 1 }).lean();
    if (prevEvent && prevEvent.status === 'replied') {
      console.log(`[emailWorker] Contact ${contact._id} replied to step ${event.stepIndex - 1}, skipping.`);
      event.status = 'failed';
      event.failReason = 'Skipped: Contact replied';
      await event.save();
      await releaseAccountRateLimit(account._id);
      return;
    }
  }

  if (!contact || contact.unsubscribed || contact.bounced) {
    event.status = 'failed';
    event.failReason = 'contact unsubscribed or bounced';
    await event.save();
    await releaseAccountRateLimit(account._id);
    return;
  }

  const canSend = await canSendToday(account);
  if (!canSend) {
    console.log(`[emailWorker] Account daily send cap hit for ${account._id}. Re-queuing for tomorrow.`);
    await releaseAccountRateLimit(account._id);
    await emailQueue.add(job.data, {
      jobId: eventId,
      delay: 24 * 60 * 60 * 1000,
      ...EMAIL_JOB_OPTS,
    });
    return;
  }

  const trackingPixelUrl = `${process.env.APP_BASE_URL}/api/track/open?eid=${eventId}`;
  const unsubscribeUrl = `${process.env.APP_BASE_URL}/api/track/unsubscribe?eid=${eventId}&uid=${contact._id}`;

  const subject = interpolate(step.subject, contact);
  const htmlBody = buildHtml({
    body: interpolate(step.body, contact),
    trackingPixelUrl,
    unsubscribeUrl,
    eventId,
  });

  try {
    const messageId = await sendEmail({
      accountId: account._id,
      to: contact.email,
      subject,
      htmlBody,
      unsubscribeUrl,
    });

    event.status = 'sent';
    event.messageId = messageId;
    await event.save();
    await ColdCampaign.findByIdAndUpdate(campaign._id, { $inc: { 'stats.sent': 1 } });
    console.log(`[emailWorker] Sent email to ${contact.email} (MsgId: ${messageId})`);

    if (event.stepIndex + 1 < campaign.steps.length) {
      const nextStepIndex = event.stepIndex + 1;
      const nextStep = campaign.steps[nextStepIndex];
      let targetMs = Date.now();
      if (nextStep.delayDays) targetMs += nextStep.delayDays * 24 * 60 * 60 * 1000;

      targetMs = getNextValidTime(targetMs, campaign.schedule);

      const stableHash = parseInt(contact._id.toString().slice(-4), 16);
      const assignedAccountId = campaign.accountIds[stableHash % campaign.accountIds.length];
      const scheduledMs = await reserveAccountSlot(assignedAccountId, targetMs);
      const finalDelayMs = Math.max(0, scheduledMs - Date.now());

      const nextEvent = await EmailEvent.create({
        campaignId: campaign._id,
        contactId: contact._id,
        accountId: assignedAccountId,
        userId: campaign.userId,
        stepIndex: nextStepIndex,
        status: 'queued',
        scheduledFor: new Date(scheduledMs),
      });

      await emailQueue.add({ eventId: nextEvent._id.toString() }, {
        jobId: nextEvent._id.toString(),
        delay: finalDelayMs,
        ...EMAIL_JOB_OPTS,
      });
    }
  } catch (err) {
    await releaseAccountRateLimit(account._id);
    console.error(`[emailWorker] Failed to send email to ${contact.email}:`, err.message);
    const permanent = /invalid|bounce|550|551|553/.test(err.message?.toLowerCase());
    if (permanent) {
      event.status = 'failed';
      event.failReason = err.message;
      await event.save();
      await Contact.findByIdAndUpdate(contact._id, { bounced: true });

      const updatedCampaign = await ColdCampaign.findByIdAndUpdate(
        campaign._id,
        { $inc: { 'stats.bounced': 1 } },
        { new: true }
      );

      if (updatedCampaign && updatedCampaign.stats.sent > 20) {
        const bounceRate = updatedCampaign.stats.bounced / updatedCampaign.stats.sent;
        if (bounceRate > 0.05 && updatedCampaign.status !== 'paused') {
          console.log(`[emailWorker] CIRCUIT BREAKER TRIPPED for Campaign ${campaign._id}. Bounce rate: ${(bounceRate * 100).toFixed(1)}%. Auto-pausing.`);
          await ColdCampaign.findByIdAndUpdate(campaign._id, { status: 'paused' });
        }
      }
    } else {
      throw err;
    }
  }
});

console.log(`[emailWorker] Init with concurrency=${EMAIL_WORKER_CONCURRENCY}, rateLimitMs=${EMAIL_ACCOUNT_RATE_LIMIT_MS}...`);
export default emailQueue;
