import Redis from 'ioredis';
import { EMAIL_ACCOUNT_RATE_LIMIT_MS } from '../config/emailQueueConfig.js';

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
redis.on('error', (err) => console.error('[accountScheduleSlots] Redis error:', err.message));

const SLOT_KEY_PREFIX = 'account:nextSlot:';

/**
 * Atomically reserve the next send slot for an account across campaigns.
 * Returns the UTC ms timestamp when this job should run.
 */
export async function reserveAccountSlot(accountId, baseMs, gapMs = EMAIL_ACCOUNT_RATE_LIMIT_MS) {
  const key = `${SLOT_KEY_PREFIX}${accountId}`;
  const base = Math.max(baseMs, Date.now());

  try {
    const script = `
      local key = KEYS[1]
      local baseMs = tonumber(ARGV[1])
      local gap = tonumber(ARGV[2])
      local current = redis.call('GET', key)
      local slotMs = baseMs
      if current then
        local c = tonumber(current)
        if c and c > slotMs then slotMs = c end
      end
      redis.call('SET', key, tostring(slotMs + gap))
      return slotMs
    `;
    const slotMs = await redis.eval(script, 1, key, String(base), String(gapMs));
    return parseInt(slotMs, 10);
  } catch (err) {
    console.error(`[accountScheduleSlots] reserve failed for ${accountId}:`, err.message);
    return base;
  }
}

export { redis as accountSlotRedis };
