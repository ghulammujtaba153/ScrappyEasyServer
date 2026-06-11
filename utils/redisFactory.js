import Redis from 'ioredis';

let redisDegraded = false;
let lastQuotaLogAt = 0;

const registeredClients = new Set();

const QUOTA_PATTERN = /max requests limit exceeded|limit exceeded|quota/i;

export function isRedisQuotaError(err) {
  const msg = String(err?.message || err || '');
  return QUOTA_PATTERN.test(msg);
}

export function isRedisDegraded() {
  return redisDegraded;
}

function logQuotaOnce(label) {
  const now = Date.now();
  if (now - lastQuotaLogAt < 60_000) return;
  lastQuotaLogAt = now;
  console.error(
    `[${label}] Upstash Redis request limit reached — pausing Redis connections. ` +
      'Email queue and Redis cache are unavailable until quota resets. Server keeps running.'
  );
}

export function markRedisDegraded(err, label = 'redis') {
  if (!isRedisQuotaError(err)) return false;

  if (!redisDegraded) {
    redisDegraded = true;
    logQuotaOnce(label);

    for (const client of registeredClients) {
      try {
        client.disconnect(false);
      } catch {
        // ignore
      }
    }
  }

  return true;
}

export function getRedisUrl() {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

export function getRedisOptions(overrides = {}) {
  const url = getRedisUrl();
  const opts = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 30000,
    enableOfflineQueue: !redisDegraded,
    lazyConnect: false,
    retryStrategy(times) {
      if (redisDegraded) return null;
      if (times > 20) return null;
      return Math.min(times * 500, 60_000);
    },
    reconnectOnError(err) {
      if (redisDegraded || isRedisQuotaError(err)) return false;
      const msg = err?.message || '';
      if (/READONLY|max requests|limit exceeded/i.test(msg)) return false;
      return true;
    },
    ...overrides,
  };

  if (url.startsWith('rediss://') || url.includes('upstash.io')) {
    opts.tls = { rejectUnauthorized: false };
  }

  return opts;
}

export function createRedisClient(label, overrides = {}) {
  const client = new Redis(getRedisUrl(), getRedisOptions(overrides));

  registeredClients.add(client);
  client.on('end', () => registeredClients.delete(client));

  client.on('connect', () => {
    if (!redisDegraded) {
      console.log(`[${label}] Connected`);
    }
  });

  client.on('error', (err) => {
    if (markRedisDegraded(err, label)) return;
    console.error(`[${label}] Redis error:`, err.message);
  });

  return client;
}

export function attachRedisGuards(label) {
  return (client) => {
    registeredClients.add(client);
    client.on('end', () => registeredClients.delete(client));
    client.on('error', (err) => {
      if (markRedisDegraded(err, label)) return;
      console.error(`[${label}] Redis error:`, err.message);
    });
    return client;
  };
}
