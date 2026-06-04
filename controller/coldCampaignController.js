import ColdCampaign from '../models/ColdCampaign.js';
import CampaignContact from '../models/CampaignContact.js';
import EmailEvent from '../models/EmailEvent.js';
import emailQueue from '../queues/emailQueue.js';
import sanitizeHtml from 'sanitize-html';
import { getNextValidTime } from '../utils/scheduleTime.js';

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

async function withTimeout(promise, ms = 30000, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message || `Operation timed out after ${ms}ms`)), ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function promoteOrRequeueExistingEvent(eventId, delayMs = 0) {
  try {
    const job = await withTimeout(emailQueue.getJob(eventId.toString()), 30000, `getJob timeout for ${eventId}`);
    if (job) {
      await withTimeout(job.promote(), 30000, `promote timeout for ${eventId}`);
      console.log(`[coldCampaignController] promoted existing queued job for event ${eventId}`);
      return true;
    }
  } catch (err) {
    console.error(`[coldCampaignController] failed to promote existing job for event ${eventId}:`, err.message);
  }

  try {
    await withTimeout(emailQueue.add({ eventId }, {
      jobId: eventId.toString(),
      delay: delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 60000 },
      removeOnComplete: true,
    }), 30000, `queue add timeout for ${eventId}`);
    console.log(`[coldCampaignController] queued fallback job for existing event ${eventId}`);
    return true;
  } catch (err) {
    console.error(`[coldCampaignController] failed to requeue existing event ${eventId}:`, err.message);
    return false;
  }
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
        console.error('[createCampaign] contact IDs:', contacts);
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

    const STAGGER_MS = 3 * 60 * 1000; // 3 minutes stagger
    let currentStaggerMs = 0;
    let queuedCount = 0;

    const cursor = CampaignContact.find({ campaignId: campaign._id }).cursor();
    
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      const contactId = doc.contactId;
      for (let stepIndex = 0; stepIndex < campaign.steps.length; stepIndex++) {
        const step = campaign.steps[stepIndex];
        
        const existing = await EmailEvent.findOne({ campaignId: campaign._id, contactId, stepIndex }).lean();
        if (existing) continue; // Skip if already queued or sent

        // If it's a no_reply step, we can conditionally queue it, but the worker will do the final check.
        // Calculate the base time from now + stagger
        let targetMs = Date.now() + currentStaggerMs;
        
        // Add step delay days
        if (stepIndex > 0 && step.delayDays) {
          targetMs += step.delayDays * 24 * 60 * 60 * 1000;
        }

        const validSendTimeMs = getNextValidTime(targetMs, campaign.schedule);
        const finalDelayMs = Math.max(0, validSendTimeMs - Date.now());

        const stableHash = parseInt(contactId.toString().slice(-4), 16);
        const assignedAccountId = campaign.accountIds[stableHash % campaign.accountIds.length];

        const event = await EmailEvent.create({
          campaignId: campaign._id,
          contactId,
          accountId:  assignedAccountId,
          userId:     campaign.userId,
          stepIndex,
          status:     'queued',
        });

        await withTimeout(emailQueue.add({ eventId: event._id.toString() }, {
          jobId: event._id.toString(),
          delay:    finalDelayMs,
          attempts: 3,
          backoff:  { type: 'exponential', delay: 60000 },
          removeOnComplete: true,
        }), 30000, `emailQueue.add timeout for event ${event._id}`);

        queuedCount++;
        break; // Only enqueue the NEXT pending step per contact
      }
      currentStaggerMs += STAGGER_MS;
    }

    if (queuedCount === 0) {
      const actualContactRows = await CampaignContact.countDocuments({ campaignId: campaign._id });
      console.error('[launchCampaign] queuedCount=0 for campaign', campaign._id, {
        campaignContacts: actualContactRows,
        campaignContactsCountField: campaign.contactsCount,
        steps: campaign.steps.length,
      });
    }

    res.json({ message: `Campaign launched. Queued ${queuedCount} next steps.`, campaign });
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
    console.log(campaign);

    if (!campaign) return res.status(404).json({ message: 'Not found' });

    if (campaign.status !== 'active') {
      campaign.status = 'active';
      await campaign.save();
    }

    const FAST_STAGGER_MS = 10 * 1000; // 10s stagger to avoid instant spam block
    let currentStaggerMs = 0;
    let queuedCount = 0;
    
    const cursor = CampaignContact.find({ campaignId: campaign._id }).cursor();
    
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      const contactId = doc.contactId;
      for (let stepIndex = 0; stepIndex < campaign.steps.length; stepIndex++) {
        const step = campaign.steps[stepIndex];

        const existing = await EmailEvent.findOne({ campaignId: campaign._id, contactId, stepIndex }).lean();
        if (existing) {
          if (existing.status === 'queued' || existing.status === 'failed') {
            const promoted = await promoteOrRequeueExistingEvent(existing._id.toString(), currentStaggerMs);
            if (promoted) queuedCount++;
          }
          break;
        }

        const stableHash = parseInt(contactId.toString().slice(-4), 16);
        const assignedAccountId = campaign.accountIds[stableHash % campaign.accountIds.length];

        const event = await EmailEvent.create({
          campaignId: campaign._id,
          contactId,
          accountId:  assignedAccountId,
          userId:     campaign.userId,
          stepIndex,
          status:     'queued',
        });

        await withTimeout(emailQueue.add({ eventId: event._id.toString() }, {
          jobId: event._id.toString(),
          delay:    currentStaggerMs,
          attempts: 3,
          backoff:  { type: 'exponential', delay: 60000 },
          removeOnComplete: true,
        }), 30000, `emailQueue.add timeout for event ${event._id}`);

        queuedCount++;
        break; // Only enqueue the next pending step per contact
      }
      currentStaggerMs += FAST_STAGGER_MS;
    }

    res.json({ message: `Queued ${queuedCount} emails to send immediately.`, queuedCount });
  } catch (err) {
    next(err);
  }
}

