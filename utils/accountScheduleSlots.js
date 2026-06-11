import { createRedisClient } from './redisFactory.js';
import { EMAIL_ACCOUNT_RATE_LIMIT_MS } from '../config/emailQueueConfig.js';

const redis = createRedisClient('accountScheduleSlots');

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
