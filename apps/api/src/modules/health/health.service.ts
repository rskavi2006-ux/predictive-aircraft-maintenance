export type Check = () => Promise<void>;

export interface DependencyStatus {
  status: 'up' | 'down';
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  status: 'ok' | 'unavailable';
  timestamp: string;
  uptimeSeconds: number;
  dependencies: Record<string, DependencyStatus>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, name: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} check timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Runs real pings (not cached connection state), each with a short timeout.
export async function getHealthReport(
  checks: Record<string, Check>,
  timeoutMs = 1500,
): Promise<HealthReport> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, check]): Promise<[string, DependencyStatus]> => {
      const started = Date.now();
      try {
        await withTimeout(check(), timeoutMs, name);
        return [name, { status: 'up', latencyMs: Date.now() - started }];
      } catch (err) {
        const error = err instanceof Error ? err.message : 'unknown error';
        return [name, { status: 'down', latencyMs: Date.now() - started, error }];
      }
    }),
  );

  const allUp = entries.every(([, dep]) => dep.status === 'up');
  return {
    status: allUp ? 'ok' : 'unavailable',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    dependencies: Object.fromEntries(entries),
  };
}