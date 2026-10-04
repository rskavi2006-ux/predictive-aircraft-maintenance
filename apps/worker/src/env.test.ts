import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('worker env', () => {
  it('applies defaults', () => {
    const env = loadEnv({ REDIS_URL: 'redis://localhost:6379' });
    expect(env.WORKER_CONCURRENCY).toBe(5);
  });

  it('fails fast when REDIS_URL is missing', () => {
    expect(() => loadEnv({})).toThrow(/REDIS_URL/);
  });
});