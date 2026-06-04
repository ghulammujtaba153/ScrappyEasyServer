/**
 * trackingSyncWorker.js
 *
 * Drains the Redis open/click buffers every 30 seconds and writes
 * the aggregated stats to MongoDB in bulk. This keeps the hot tracking
 * endpoints (trackOpen, trackClick) completely non-blocking.
 */

import { drainQueue, OPEN_QUEUE_KEY, CLICK_QUEUE_KEY } from '../services/trackingBuffer.js';
import EmailEvent from '../models/EmailEvent.js';
import ColdCampaign from '../models/ColdCampaign.js';

const SYNC_INTERVAL_MS = 30_000; // 30 seconds

async function syncOpens() {
  const events = await drainQueue(OPEN_QUEUE_KEY, 500);
  if (!events.length) return;

  const campaignIncrements = new Map();
  const bulkOps = events.map(({ eid, ts }) => {
    return {
      updateOne: {
        filter:  { _id: eid, status: 'sent' },   // Only upgrade from sent → opened
        update:  { $set: { status: 'opened', openedAt: new Date(ts) } },
        upsert:  false,
      },
    };
  });

  const result = await EmailEvent.bulkWrite(bulkOps, { ordered: false });

  if (result.modifiedCount > 0) {
    // Fetch the campaign IDs we just updated so we can increment correctly
    const updatedEids = events.map(e => e.eid);
    const updatedEvents = await EmailEvent.find({ _id: { $in: updatedEids }, status: 'opened' }).select('campaignId');
    for (const ev of updatedEvents) {
      const id = ev.campaignId.toString();
      campaignIncrements.set(id, (campaignIncrements.get(id) || 0) + 1);
    }
    for (const [campaignId, count] of campaignIncrements) {
      await ColdCampaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.opened': count } });
    }
    console.log(`[trackingSyncWorker] Synced ${result.modifiedCount} opens to MongoDB.`);
  }
}

async function syncClicks() {
  const events = await drainQueue(CLICK_QUEUE_KEY, 500);
  if (!events.length) return;

  const campaignIncrements = new Map();
  const bulkOps = events.map(({ eid, url, ts }) => ({
    updateOne: {
      filter: { _id: eid },
      update: { $set: { status: 'clicked', clickedAt: new Date(ts), clickedUrl: url } },
      upsert: false,
    },
  }));

  const result = await EmailEvent.bulkWrite(bulkOps, { ordered: false });

  if (result.modifiedCount > 0) {
    const updatedEids = events.map(e => e.eid);
    const updatedEvents = await EmailEvent.find({ _id: { $in: updatedEids }, status: 'clicked' }).select('campaignId');
    for (const ev of updatedEvents) {
      const id = ev.campaignId.toString();
      campaignIncrements.set(id, (campaignIncrements.get(id) || 0) + 1);
    }
    for (const [campaignId, count] of campaignIncrements) {
      await ColdCampaign.findByIdAndUpdate(campaignId, { $inc: { 'stats.clicked': count } });
    }
    console.log(`[trackingSyncWorker] Synced ${result.modifiedCount} clicks to MongoDB.`);
  }
}

async function syncAll() {
  try {
    await Promise.all([syncOpens(), syncClicks()]);
  } catch (err) {
    console.error('[trackingSyncWorker] Sync error:', err.message);
  }
}

// Run immediately at startup then every 30 seconds
syncAll();
setInterval(syncAll, SYNC_INTERVAL_MS);

console.log('[trackingSyncWorker] Init — syncing tracking events every 30s.');
