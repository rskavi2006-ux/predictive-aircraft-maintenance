import { Router } from 'express';
import { healthController } from './health.controller.js';
import type { Check } from './health.service.js';

export const healthRouter = (checks: Record<string, Check>, timeoutMs?: number) => {
  const router = Router();
  router.get('/', healthController(checks, timeoutMs));
  return router;
};