/**
 * trackingBuffer.js
 *
 * Buffers open/click events in Redis lists and provides a drainQueue helper
 * for the trackingSyncWorker to batch-flush to MongoDB every 30s.
 *
 * Uses ioredis (already installed) instead of the 'redis' npm package.
 */

import { createRedisClient, isRedisDegraded } from '../utils/redisFactory.js';

const client = createRedisClient('trackingBuffer');

const OPEN_QUEUE_KEY = 'tracking:opens';
const CLICK_QUEUE_KEY = 'tracking:clicks';

/**
 * Buffer an open event into Redis. Non-blocking — fire-and-forget.
 */
export async function bufferOpen(eid) {
  try {
    // Check if client is ready before pushing to prevent hanging operations
    if (!isRedisDegraded() && client.status === 'ready') {
      await client.rpush(OPEN_QUEUE_KEY, JSON.stringify({ eid, ts: Date.now() }));
    } else {
      console.warn('[trackingBuffer] Redis not ready, drop-prevented or bypassing to fallback.');
    }
  } catch (err) {
    console.error('[trackingBuffer] bufferOpen error:', err.message);
  }
}

/**
 * Buffer a click event into Redis. Non-blocking — fire-and-forget.
 */
export async function bufferClick(eid, url) {
  try {
    if (!isRedisDegraded() && client.status === 'ready') {
      await client.rpush(CLICK_QUEUE_KEY, JSON.stringify({ eid, url, ts: Date.now() }));
    } else {
      console.warn('[trackingBuffer] Redis not ready, dropping click action event context safely.');
    }
  } catch (err) {
    console.error('[trackingBuffer] bufferClick error:', err.message);
  }
}

/**
 * Atomically drain up to `count` events from a Redis list.
 * ioredis uses lowercase command names (lpop, lmpop).
 * LMPOP requires Redis 7+; falls back to repeated LPOP for older versions.
 */
export async function drainQueue(key, count = 200) {
  const items = [];
  if (isRedisDegraded() || client.status !== 'ready') {
    console.warn(`[trackingBuffer] Cannot drain queue ${key} — Redis connection status: ${client.status}`);
    return items;
  }

  try {
    // Try LMPOP (Redis 7+ / Upstash native support handles this perfectly)
    const result = await client.lmpop(1, key, 'LEFT', 'COUNT', count);
    if (result && result[1]) {
      for (const raw of result[1]) {
        try { items.push(JSON.parse(raw)); } catch (_) { }
      }
    }
  } catch (_) {
    // Fallback: individual LPOP loop (Redis < 7)
    try {
      for (let i = 0; i < count; i++) {
        const raw = await client.lpop(key);
        if (!raw) break;
        try { items.push(JSON.parse(raw)); } catch (_) { }
      }
    } catch (fallbackErr) {
      console.error('[trackingBuffer] Fallback LPOP loop error:', fallbackErr.message);
    }
  }
  return items;
}

export { OPEN_QUEUE_KEY, CLICK_QUEUE_KEY };