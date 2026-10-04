import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';

const logger = pino({ level: 'silent' });
const up = async () => {};
const down = async () => {
  throw new Error('connection refused');
};
const hang = () => new Promise<void>(() => {});

describe('GET /api/v1/health', () => {
  it('returns 200 with every dependency up', async () => {
    const app = createApp({ logger, corsOrigins: [], checks: { mongo: up, redis: up } });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.dependencies.mongo.status).toBe('up');
    expect(res.body.dependencies.redis.status).toBe('up');
  });

  it('returns 503 with per-dependency status when one is down or times out', async () => {
    const app = createApp({
      logger,
      corsOrigins: [],
      healthTimeoutMs: 50,
      checks: { mongo: down, redis: hang },
    });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unavailable');
    expect(res.body.dependencies.mongo.status).toBe('down');
    expect(res.body.dependencies.redis.status).toBe('down');
    expect(res.body.dependencies.redis.error).toContain('timed out');
  });
});

describe('platform basics', () => {
  it('echoes X-Request-Id and uses the standard error format for unknown routes', async () => {
    const app = createApp({ logger, corsOrigins: [], checks: {} });
    const res = await request(app).get('/api/v1/nope').set('X-Request-Id', 'test-request-1234');
    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBe('test-request-1234');
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});