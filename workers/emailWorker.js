import emailQueue from '../queues/emailQueue.js';
import EmailEvent from '../models/EmailEvent.js';
import Contact from '../models/Contact.js';
import ColdCampaign from '../models/ColdCampaign.js';
import { sendEmail, interpolate, buildHtml } from '../utils/emailSender.js';
import { canSendToday } from '../services/emailAccountService.js';
import EmailAccount from '../models/EmailAccount.js';
import { getNextValidTime } from '../controller/coldCampaignController.js';
import Redis from 'ioredis';

// 1. Production-ready Upstash ioredis configuration
const redisOptions = {
  maxRetriesPerRequest: null, // CRITICAL: Must be null for Upstash/Bull to prevent application crash loops
  lazyConnect: false,
  connectTimeout: 30000, // 30s timeout for connection
  retryStrategy: (times) => Math.min(times * 100, 3000),
};

// Automatically append TLS configuration for Upstash or rediss:// URLs.
if (process.env.REDIS_URL && (process.env.REDIS_URL.startsWith('rediss://') || process.env.REDIS_URL.includes('upstash.io'))) {
  redisOptions.tls = {
    rejectUnauthorized: false // Prevents SSL handshake failures on cloud servers
  };
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

emailQueue.process(3, async (job) => {
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
    await emailQueue.add(job.data, { delay: 60 * 60 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 60000 } });
    return;
  }
  if (campaign.status !== 'active') {
    console.log(`[emailWorker] Campaign ${campaign._id} is ${campaign.status}, skipping event ${eventId}.`);
    return;
  }

  // 2. Resilient Per-account Rate Limiter (90 seconds = 90000 ms)
  const RATE_LIMIT_MS = 90000;
  const rateLimitKey = `ratelimit:account:${account._id}`;
  let lastSent = null;

  try {
    lastSent = await redis.get(rateLimitKey);
  } catch (err) {
    console.error(`[emailWorker] Redis rate limit check failed: ${err.message}. Falling back to default execution.`);
  }

  const now = Date.now();
  if (lastSent && now - parseInt(lastSent) < RATE_LIMIT_MS) {
    const delayRequired = RATE_LIMIT_MS - (now - parseInt(lastSent));
    console.log(`[emailWorker] Rate limit hit for account ${account._id}. Re-queuing ${eventId} with delay ${delayRequired}ms.`);

    // Fallback: If job.moveToDelayed fails due to library version limitations, we manually re-add
    try {
      await job.moveToDelayed(now + delayRequired);
    } catch (queueErr) {
      await emailQueue.add(job.data, { delay: delayRequired, attempts: 3, backoff: { type: 'exponential', delay: 60000 } });
    }
    return;
  }

  // Claim the rate limit token safely
  try {
    await redis.set(rateLimitKey, now.toString(), 'PX', RATE_LIMIT_MS);
  } catch (err) {
    console.error(`[emailWorker] Redis rate limit set failed:`, err.message);
  }

  const step = campaign.steps[event.stepIndex];

  if (step.sendCondition === 'no_reply' && event.stepIndex > 0) {
    const prevEvent = await EmailEvent.findOne({ campaignId: campaign._id, contactId: contact._id, stepIndex: event.stepIndex - 1 }).lean();
    if (prevEvent && prevEvent.status === 'replied') {
      console.log(`[emailWorker] Contact ${contact._id} replied to step ${event.stepIndex - 1}, skipping.`);
      event.status = 'failed';
      event.failReason = 'Skipped: Contact replied';
      await event.save();
      return;
    }
  }

  if (!contact || contact.unsubscribed || contact.bounced) {
    event.status = 'failed';
    event.failReason = 'contact unsubscribed or bounced';
    await event.save();
    return;
  }

  const canSend = await canSendToday(account);
  if (!canSend) {
    console.log(`[emailWorker] Account daily send cap hit for ${account._id}. Re-queuing for tomorrow.`);
    await emailQueue.add(job.data, { delay: 24 * 60 * 60 * 1000, attempts: 3, backoff: { type: 'exponential', delay: 60000 } });
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

    // Queue NEXT STEP
    if (event.stepIndex + 1 < campaign.steps.length) {
      const nextStepIndex = event.stepIndex + 1;
      const nextStep = campaign.steps[nextStepIndex];
      let targetMs = Date.now();
      if (nextStep.delayDays) targetMs += nextStep.delayDays * 24 * 60 * 60 * 1000;

      const validTimeMs = getNextValidTime(targetMs, campaign.schedule);
      const finalDelayMs = Math.max(0, validTimeMs - Date.now());

      const stableHash = parseInt(contact._id.toString().slice(-4), 16);
      const assignedAccountId = campaign.accountIds[stableHash % campaign.accountIds.length];

      const nextEvent = await EmailEvent.create({
        campaignId: campaign._id,
        contactId: contact._id,
        accountId: assignedAccountId,
        userId: campaign.userId,
        stepIndex: nextStepIndex,
        status: 'queued',
      });

      await emailQueue.add({ eventId: nextEvent._id.toString() }, {
        delay: finalDelayMs,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: true,
      });
    }
  } catch (err) {
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

      // Circuit Breaker: Auto-pause if bounce rate > 5% after at least 20 sends
      if (updatedCampaign && updatedCampaign.stats.sent > 20) {
        const bounceRate = updatedCampaign.stats.bounced / updatedCampaign.stats.sent;
        if (bounceRate > 0.05 && updatedCampaign.status !== 'paused') {
          console.log(`[emailWorker] 🚨 CIRCUIT BREAKER TRIPPED for Campaign ${campaign._id}. Bounce rate: ${(bounceRate * 100).toFixed(1)}%. Auto-pausing.`);
          await ColdCampaign.findByIdAndUpdate(campaign._id, { status: 'paused' });
        }
      }
    } else {
      throw err;
    }
  }
});

console.log('[emailWorker] Init...');
export default emailQueue;