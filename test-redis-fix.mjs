import 'dotenv/config.js';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
console.log(`Connecting to Upstash Redis...`);

const redis = new Redis(redisUrl, {
  connectTimeout: 10000,
  maxRetriesPerRequest: null,
  // Removed problematic options that cause "Stream isn't writeable" error
  lazyConnect: false,
});

let connected = false;

redis.on('connect', () => {
  console.log('[event] connected');
  connected = true;
});
redis.on('ready', () => console.log('[event] ready'));
redis.on('error', (e) => console.error('[event] error:', e.message));

// Wait for connection before sending commands
setTimeout(async () => {
  if (!connected) {
    console.error('❌ Failed to connect within 5s');
    process.exit(1);
  }
  
  try {
    console.log('Sending PING...');
    const result = await redis.ping();
    console.log('✅ PING successful:', result);
    await redis.set('test-key', 'test-value');
    const val = await redis.get('test-key');
    console.log('✅ SET/GET works:', val);
    console.log('✅ Redis connectivity confirmed - Bull queues should work!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Command failed:', e.message);
    process.exit(1);
  }
}, 3000);

setTimeout(() => {
  console.error('❌ Test timed out');
  process.exit(1);
}, 15000);
