import 'dotenv/config.js';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Testing Redis with Upstash workaround...`);

const redis = new Redis(redisUrl, {
  connectTimeout: 5000,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  enableOfflineQueue: false,
  lazyConnect: false,
  retryStrategy: (times) => Math.min(times * 50, 2000),
});

let pingTimeout;

redis.on('connect', () => console.log('[event] connected'));
redis.on('ready', () => console.log('[event] ready'));
redis.on('error', (e) => console.error('[event] error:', e.message));
redis.on('close', () => console.log('[event] close'));
redis.on('reconnecting', () => console.log('[event] reconnecting'));

console.log('Sending PING...');
pingTimeout = setTimeout(() => {
  console.error('❌ PING timed out after 5s - this is the Bull queue issue');
  console.error('Solution: Check Upstash firewall rules and credentials');
  process.exit(1);
}, 5000);

redis.ping()
  .then(res => {
    clearTimeout(pingTimeout);
    console.log('✅ PING successful:', res);
    process.exit(0);
  })
  .catch(e => {
    clearTimeout(pingTimeout);
    console.error('❌ PING error:', e.message);
    process.exit(1);
  });
