import { HEARTBEAT_KEY, SYSTEM_QUEUE } from '@aeroguard/shared';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { loadDotEnv, loadEnv } from './env.js';

loadDotEnv();
const env = loadEnv();
const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

// BullMQ connections must use maxRetriesPerRequest: null (project rule 12).
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
// Separate connection for heartbeat writes.
const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1 });
connection.on('error', (err) => logger.debug({ err: err.message }, 'bullmq redis error'));
redis.on('error', (err) => logger.debug({ err: err.message }, 'heartbeat redis error'));

// Real jobs (prediction, compliance, reports) are added in later chunks.
const worker = new Worker(
  SYSTEM_QUEUE,
  async (job) => {
    if (job.name === 'ping') {
      logger.info({ jobId: job.id }, 'ping job processed');
      return { pong: true, at: new Date().toISOString() };
    }
    throw new Error(`Unknown job: ${job.name}`);
  },
  { connection, concurrency: env.WORKER_CONCURRENCY },
);
worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job failed'));
worker.on('error', (err) => logger.debug({ err: err.message }, 'worker error'));

// Heartbeat: write every 5s with a 15s TTL, so a dead worker disappears from health quickly.
async function beat() {
  try {
    const value = JSON.stringify({ pid: process.pid, at: new Date().toISOString() });
    await redis.set(HEARTBEAT_KEY, value, 'EX', 15);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'heartbeat failed');
  }
}
void beat();
const timer = setInterval(() => void beat(), 5000);

logger.info({ queue: SYSTEM_QUEUE, concurrency: env.WORKER_CONCURRENCY }, 'worker started');

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  const force = setTimeout(() => {
    logger.error('forced exit after timeout');
    process.exit(1);
  }, 10_000);
  force.unref();
  clearInterval(timer);
  try {
    await worker.close(); // waits for jobs already running
    await redis.del(HEARTBEAT_KEY); // so health reports the worker as down right away
  } catch (err) {
    logger.error({ err: (err as Error).message }, 'error during shutdown');
  } finally {
    connection.disconnect();
    redis.disconnect();
    logger.info('shutdown complete');
    process.exit(0);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));