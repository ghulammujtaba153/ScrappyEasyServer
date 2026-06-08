import ColdCampaign from '../models/ColdCampaign.js';
import CampaignContact from '../models/CampaignContact.js';
import EmailEvent from '../models/EmailEvent.js';
import emailQueue from '../queues/emailQueue.js';
import sanitizeHtml from 'sanitize-html';
import { getNextValidTime } from '../utils/scheduleTime.js';
import { reserveAccountSlot } from '../utils/accountScheduleSlots.js';
import {
  EMAIL_LAUNCH_STAGGER_MS,
  EMAIL_SEND_NOW_STAGGER_MS,
  EMAIL_ENQUEUE_BATCH_SIZE,
  EMAIL_JOB_OPTS,
} from '../config/emailQueueConfig.js';

export { getNextValidTime };

function sanitizeSteps(steps) {
  if (!steps || !Array.isArray(steps)) return steps;
  return steps.map(step => {
    if (step.body) {
      step.body = sanitizeHtml(step.body, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([ 'img', 'br', 'p', 'div', 'span', 'small', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6' ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          'img': ['src', 'width', 'height', 'style'],
          'a': ['href', 'style', 'target'],
          'span': ['style'],
          'div': ['style'],
          'p': ['style']
        }
      });
    }
    return step;
  });
}

function assignAccountId(contactId, accountIds) {
  const stableHash = parseInt(contactId.toString().slice(-4), 16);
  return accountIds[stableHash % accountIds.length];
}

async function addEventJob(eventId, delayMs = 0) {
  await emailQueue.add({ eventId: eventId.toString() }, {
    jobId: eventId.toString(),
    delay: delayMs,
    ...EMAIL_JOB_OPTS,
  });
}

async function promoteOrRequeueExistingEvent(eventId, delayMs = 0) {
  try {
    const job = await emailQueue.getJob(eventId.toString());
    if (job) {
      const state = await job.getState();
      if (state === 'failed') {
        await job.remove();
      } else if (state === 'delayed' || state === 'waiting') {
        await job.promote();
        console.log(`[coldCampaignController] promoted existing queued job for event ${eventId}`);
        return true;
      } else if (state === 'active' || state === 'completed') {
        return true;
      }
    }
  } catch (err) {
    console.error(`[coldCampaignController] failed to promote existing job for event ${eventId}:`, err.message);
  }

  try {
    await addEventJob(eventId, delayMs);
    console.log(`[coldCampaignController] queued fallback job for existing event ${eventId}`);
    return true;
  } catch (err) {
    console.error(`[coldCampaignController] failed to requeue existing event ${eventId}:`, err.message);
    return false;
  }
}

/** Re-add Bull jobs for queued EmailEvents whose jobs failed or were never processed. */
async function requeueOrphanedEvents(campaignId) {
  const events = await EmailEvent.find({ campaignId, status: 'queued' });
  let count = 0;

  for (const event of events) {
    try {
      const job = await emailQueue.getJob(event._id.toString());
      const state = job ? await job.getState() : null;

      if (job && state !== 'failed') continue;

      if (job && state === 'failed') {
        await job.remove();
      }

      const delayMs = event.scheduledFor
        ? Math.max(0, event.scheduledFor.getTime() - Date.now())
        : 0;

      await addEventJob(event._id, delayMs);
      count++;
    } catch (err) {
      console.error(`[requeueOrphanedEvents] ${event._id}:`, err.message);
    }
  }

  return count;
}

/**
 * Build pending first-step jobs for all contacts, respecting schedule + account slots.
 */
async function buildPendingEnqueueList(campaign, { staggerMs, respectSchedule }) {
  const contactDocs = await CampaignContact.find({ campaignId: campaign._id }).lean();
  const existingEvents = await EmailEvent.find({ campaignId: campaign._id }).select('contactId stepIndex status').lean();
  const existingMap = new Map(
    existingEvents.map(e => [`${e.contactId}-${e.stepIndex}`, e])
  );

  let campaignStaggerMs = 0;
  const pending = [];

  for (const doc of contactDocs) {
    const contactId = doc.contactId;

    for (let stepIndex = 0; stepIndex < campaign.steps.length; stepIndex++) {
      const key = `${contactId}-${stepIndex}`;
      const existing = existingMap.get(key);
      if (existing) continue;

      let targetMs = Date.now() + campaignStaggerMs;
      if (stepIndex > 0 && campaign.steps[stepIndex].delayDays) {
        targetMs += campaign.steps[stepIndex].delayDays * 24 * 60 * 60 * 1000;
      }
      if (respectSchedule) {
        targetMs = getNextValidTime(targetMs, campaign.schedule);
      }

      const assignedAccountId = assignAccountId(contactId, campaign.accountIds);
      const scheduledMs = await reserveAccountSlot(assignedAccountId, targetMs);

      pending.push({
        campaignId: campaign._id,
        contactId,
        accountId: assignedAccountId,
        userId: campaign.userId,
        stepIndex,
        status: 'queued',
        scheduledFor: new Date(scheduledMs),
        delayMs: Math.max(0, scheduledMs - Date.now()),
      });

      campaignStaggerMs += staggerMs;
      break;
    }
  }

  return pending;
}

async function bulkInsertAndQueue(pending) {
  let queuedCount = 0;

  for (let i = 0; i < pending.length; i += EMAIL_ENQUEUE_BATCH_SIZE) {
    const chunk = pending.slice(i, i + EMAIL_ENQUEUE_BATCH_SIZE);
    const docs = chunk.map(({ delayMs, ...doc }) => doc);
    const inserted = await EmailEvent.insertMany(docs, { ordered: false });

    const jobs = inserted.map((event, idx) => ({
      data: { eventId: event._id.toString() },
      opts: {
        jobId: event._id.toString(),
        delay: chunk[idx].delayMs,
        ...EMAIL_JOB_OPTS,
      },
    }));

    await emailQueue.addBulk(jobs);
    queuedCount += inserted.length;
  }

  return queuedCount;
}

async function enqueueCampaignLaunch(campaign) {
  const pending = await buildPendingEnqueueList(campaign, {
    staggerMs: EMAIL_LAUNCH_STAGGER_MS,
    respectSchedule: true,
  });

  let queuedCount = 0;
  if (pending.length > 0) {
    queuedCount = await bulkInsertAndQueue(pending);
  } else {
    const actualContactRows = await CampaignContact.countDocuments({ campaignId: campaign._id });
    console.warn('[launchCampaign] no new events to create for campaign', campaign._id, {
      campaignContacts: actualContactRows,
      campaignContactsCountField: campaign.contactsCount,
      steps: campaign.steps.length,
    });
  }

  const requeued = await requeueOrphanedEvents(campaign._id);
  if (requeued > 0) {
    console.log(`[launchCampaign] Re-queued ${requeued} orphaned jobs for campaign ${campaign._id}`);
    queuedCount += requeued;
  }

  console.log(`[launchCampaign] Queued ${queuedCount} jobs for campaign ${campaign._id}`);
  return queuedCount;
}

export async function getCampaigns(req, res, next) {
  try {
    const campaigns = await ColdCampaign.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json(campaigns);
  } catch (err) {
    next(err);
  }
}

export async function getCampaign(req, res, next) {
  try {
    const campaign = await ColdCampaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ message: 'Not found' });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

export async function createCampaign(req, res, next) {
  try {
    const { name, accountIds, contacts, steps, schedule } = req.body;
    const sanitizedSteps = sanitizeSteps(steps);
    const campaign = await ColdCampaign.create({
      userId: req.user._id,
      name, accountIds, steps: sanitizedSteps, schedule,
      contactsCount: contacts ? contacts.length : 0,
    });

    if (contacts && contacts.length > 0) {
      const docs = contacts.map(cId => ({ campaignId: campaign._id, contactId: cId }));
      try {
        await CampaignContact.insertMany(docs, { ordered: false });
      } catch (err) {
        console.error('[createCampaign] insertMany error for campaign', campaign._id, {
          error: err.message,
          name: err.name,
          code: err.code,
          contactsCount: contacts.length,
        });
      }
    }

    res.status(201).json(campaign);
  } catch (err) {
    next(err);
  }
}

export async function updateCampaign(req, res, next) {
  try {
    const { steps } = req.body;
    if (steps) {
      req.body.steps = sanitizeSteps(steps);
    }
    const campaign = await ColdCampaign.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id, status: { $in: ['draft', 'paused'] } },
      req.body,
      { new: true }
    );
    if (!campaign) return res.status(404).json({ message: 'Not found or not editable' });
    res.json(campaign);
  } catch (err) {
    next(err);
  }
}

export async function launchCampaign(req, res, next) {
  try {
    const campaign = await ColdCampaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ message: 'Not found' });
    if (campaign.status === 'active') return res.status(400).json({ message: 'Already active' });

    campaign.status = 'active';
    await campaign.save();

    const campaignSnapshot = campaign.toObject();

    res.status(202).json({
      message: 'Campaign launching in background',
      campaign,
    });

    setImmediate(async () => {
      try {
        await enqueueCampaignLaunch(campaignSnapshot);
      } catch (err) {
        console.error('[launchCampaign] background enqueue failed:', campaignSnapshot._id, err.message);
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function pauseCampaign(req, res, next) {
  try {
    await ColdCampaign.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { status: 'paused' }
    );
    res.json({ message: 'Paused' });
  } catch (err) {
    next(err);
  }
}

export async function deleteCampaign(req, res, next) {
  try {
    const deleted = await ColdCampaign.findOneAndDelete({ _id: req.params.id, userId: req.user._id, status: { $in: ['draft', 'paused'] } });
    if (!deleted) {
      return res.status(404).json({ message: 'Campaign not found or cannot be deleted while active.' });
    }
    res.json({ message: 'Deleted' });
  } catch (err) {
    next(err);
  }
}

export async function getCampaignStats(req, res, next) {
  try {
    const campaign = await ColdCampaign.findOne({ _id: req.params.id, userId: req.user._id }).select('stats name');
    if (!campaign) return res.status(404).json({ message: 'Not found' });
    const events = await EmailEvent.find({ campaignId: req.params.id })
      .populate('contactId', 'email firstName lastName')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ stats: campaign.stats, events });
  } catch (err) {
    next(err);
  }
}

export async function sendNowCampaign(req, res, next) {
  const campaignId = req.params.id;
  console.log(`[sendNowCampaign] Received request to send now for campaign ${campaignId} by user ${req.user._id}`);

  try {
    const campaign = await ColdCampaign.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ message: 'Not found' });

    if (campaign.status !== 'active') {
      campaign.status = 'active';
      await campaign.save();
    }

    const contactDocs = await CampaignContact.find({ campaignId: campaign._id }).lean();
    const existingEvents = await EmailEvent.find({ campaignId: campaign._id }).select('contactId stepIndex status').lean();
    const existingMap = new Map(
      existingEvents.map(e => [`${e.contactId}-${e.stepIndex}`, e])
    );

    let currentStaggerMs = 0;
    let queuedCount = 0;
    const pending = [];

    for (const doc of contactDocs) {
      const contactId = doc.contactId;

      for (let stepIndex = 0; stepIndex < campaign.steps.length; stepIndex++) {
        const key = `${contactId}-${stepIndex}`;
        const existing = existingMap.get(key);

        if (existing) {
          if (existing.status === 'queued' || existing.status === 'failed') {
            const promoted = await promoteOrRequeueExistingEvent(existing._id.toString(), currentStaggerMs);
            if (promoted) queuedCount++;
          }
          break;
        }

        const assignedAccountId = assignAccountId(contactId, campaign.accountIds);
        const scheduledMs = await reserveAccountSlot(assignedAccountId, Date.now() + currentStaggerMs);

        pending.push({
          campaignId: campaign._id,
          contactId,
          accountId: assignedAccountId,
          userId: campaign.userId,
          stepIndex,
          status: 'queued',
          scheduledFor: new Date(scheduledMs),
          delayMs: Math.max(0, scheduledMs - Date.now()),
        });

        currentStaggerMs += EMAIL_SEND_NOW_STAGGER_MS;
        break;
      }
    }

    if (pending.length > 0) {
      queuedCount += await bulkInsertAndQueue(pending);
    }

    const requeued = await requeueOrphanedEvents(campaign._id);
    queuedCount += requeued;

    res.json({ message: `Queued ${queuedCount} emails to send immediately.`, queuedCount });
  } catch (err) {
    next(err);
  }
}
