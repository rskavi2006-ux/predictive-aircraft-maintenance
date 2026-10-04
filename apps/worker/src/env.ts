import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  REDIS_URL: z.string().min(1),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
});

export type WorkerEnv = z.infer<typeof schema>;

// Local dev: load the repo-root .env if present (in production, env comes from the platform).
export function loadDotEnv() {
  try {
    process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
  } catch {
    // no .env file; rely on real environment variables
  }
}

// Fails fast with one readable error listing every bad or missing variable.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): WorkerEnv {
  const result = schema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}`);
  }
  return result.data;
}