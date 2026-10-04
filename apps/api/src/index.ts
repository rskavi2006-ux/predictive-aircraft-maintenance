import { fileURLToPath } from 'node:url';
import { Redis } from 'ioredis';
import mongoose from 'mongoose';
import { pino } from 'pino';
import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

// Local dev: load the repo-root .env if it exists (in production, env comes from the platform).
try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // no .env file; rely on real environment variables
}

const env = loadEnv(); // throws a readable error listing every bad variable
const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

// Redis client for health pings and later cache. (BullMQ connections will use
// maxRetriesPerRequest: null; this one fails fast so pings never hang.)
const redis = new Redis(env.REDIS_URL, {
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 500, 5000),
});
redis.on('error', (err) => logger.debug({ err: err.message }, 'redis error'));

let stopping = false;

// Connect in the background and retry, so the API still starts (and reports 503) if Mongo is down.
async function connectMongo() {
  while (!stopping) {
    try {
      await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 2000 });
      logger.info('mongo connected');
      return;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'mongo connect failed, retrying in 5s');
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
void connectMongo();

// Real pings, not cached connection state.
const checks = {
  mongo: async () => {
    const db = mongoose.connection.db;
    if (!db) throw new Error('not connected');
    await db.command({ ping: 1 });
  },
  redis: async () => {
    await redis.ping();
  },
};

const app = createApp({
  logger,
  corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
  checks,
});

const server = app.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'api listening');
});

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('forced exit after timeout');
    process.exit(1);
  }, 10_000);
  force.unref();
  try {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    await mongoose.disconnect();
    redis.disconnect();
    logger.info('shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));