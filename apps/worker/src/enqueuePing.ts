import { SYSTEM_QUEUE } from '@aeroguard/shared';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { loadDotEnv, loadEnv } from './env.js';

loadDotEnv();
const env = loadEnv();
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue(SYSTEM_QUEUE, { connection });
const job = await queue.add('ping', {}, { removeOnComplete: 100, removeOnFail: 100 });
console.log(`enqueued ping job ${job.id}`);
await queue.close();
connection.disconnect();