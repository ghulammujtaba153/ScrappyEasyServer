import Bull from 'bull';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const redisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false, // Required by Bull for bclient/subscriber
  connectTimeout: 30000,
  retryStrategy: (times) => {
    const delay = Math.min(times * 150, 5000);
    console.log(`[emailQueue-redis] Reconnect attempt ${times}, delay: ${delay}ms`);
    return delay;
  },
};

if (redisUrl.startsWith('rediss://') || redisUrl.includes('upstash.io')) {
  redisOptions.tls = { rejectUnauthorized: false };
}

// Create explicit Redis connections for Bull's client and subscriber
const redisClient = new Redis(redisUrl, redisOptions);
const redisSubscriber = new Redis(redisUrl, redisOptions);

redisClient.on('connect', () => console.log('[emailQueue-client] Connected'));
redisClient.on('error', (err) => console.error('[emailQueue-client] Error:', err.message));
redisSubscriber.on('connect', () => console.log('[emailQueue-subscriber] Connected'));
redisSubscriber.on('error', (err) => console.error('[emailQueue-subscriber] Error:', err.message));

const queue = new Bull('email-sending', {
  createClient: (type) => {
    if (type === 'client') return redisClient;
    if (type === 'subscriber') return redisSubscriber;
    return new Redis(redisUrl, redisOptions);
  },
  limiter: {
    max: 1,
    duration: 90000
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  },
});

// Log queue events
queue.on('error', (err) => console.error('[emailQueue] Error:', err.message));
queue.on('ready', () => console.log('[emailQueue] Queue ready'));
queue.on('active', (job) => console.log(`[emailQueue] Job ${job.id} started`));
queue.on('completed', (job) => console.log(`[emailQueue] Job ${job.id} completed`));
queue.on('failed', (job, err) => console.error(`[emailQueue] Job ${job.id} failed:`, err.message));

export default queue;
