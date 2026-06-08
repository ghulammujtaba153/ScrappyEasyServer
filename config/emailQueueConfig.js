function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const EMAIL_WORKER_CONCURRENCY = readInt('EMAIL_WORKER_CONCURRENCY', 15);
export const EMAIL_ACCOUNT_RATE_LIMIT_MS = readInt('EMAIL_ACCOUNT_RATE_LIMIT_MS', 45000);
export const EMAIL_LAUNCH_STAGGER_MS = readInt('EMAIL_LAUNCH_STAGGER_MS', 30000);
export const EMAIL_SEND_NOW_STAGGER_MS = readInt('EMAIL_SEND_NOW_STAGGER_MS', 5000);
export const EMAIL_ENQUEUE_BATCH_SIZE = readInt('EMAIL_ENQUEUE_BATCH_SIZE', 200);

export const EMAIL_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60000 },
  removeOnComplete: true,
};
