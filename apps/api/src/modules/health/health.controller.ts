import type { RequestHandler } from 'express';
import { getHealthReport, type Check } from './health.service.js';

// 200 when everything is up, 503 otherwise. Both return the per-dependency body.
export const healthController =
  (checks: Record<string, Check>, timeoutMs?: number): RequestHandler =>
  async (_req, res) => {
    const report = await getHealthReport(checks, timeoutMs);
    res.set('Cache-Control', 'no-store');
    res.status(report.status === 'ok' ? 200 : 503).json(report);
  };