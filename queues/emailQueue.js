import Bull from 'bull';
import { createRedisClient, isRedisDegraded, markRedisDegraded } from '../utils/redisFactory.js';

const redisClient = createRedisClient('emailQueue-client');
const redisSubscriber = createRedisClient('emailQueue-subscriber');

const queue = new Bull('email-sending', {
  createClient: (type) => {
    if (type === 'client') return redisClient;
    if (type === 'subscriber') return redisSubscriber;
    return createRedisClient(`emailQueue-${type}`);
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: { type: 'exponential', delay: 60000 },
  },
});

queue.on('error', (err) => {
  if (markRedisDegraded(err, 'emailQueue')) return;
  console.error('[emailQueue] Error:', err.message);
});
queue.on('ready', () => console.log('[emailQueue] Queue ready'));
queue.on('active', (job) => console.log(`[emailQueue] Job ${job.id} started`));
queue.on('completed', (job) => console.log(`[emailQueue] Job ${job.id} completed`));
queue.on('failed', (job, err) => console.error(`[emailQueue] Job ${job.id} failed:`, err.message));

export function isEmailQueueAvailable() {
  return !isRedisDegraded();
}

export default queue;
