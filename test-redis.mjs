import 'dotenv/config.js';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Testing Redis connection to: ${redisUrl.replace(/:[^:]*@/, ':***@')}`);

const redis = new Redis(redisUrl, {
  connectTimeout: 5000,
  maxRetriesPerRequest: null
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('ready', () => console.log('✅ Redis ready'));
redis.on('error', (e) => console.error('❌ Redis error:', e.message));

redis.ping()
  .then(res => {
    console.log('✅ Redis PING successful:', res);
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ Redis PING failed:', e.message);
    process.exit(1);
  });

setTimeout(() => {
  console.error('❌ Timeout: Redis did not respond within 10s');
  process.exit(1);
}, 10000);
