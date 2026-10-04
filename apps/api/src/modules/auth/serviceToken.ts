import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppError } from '../../middleware/errorHandler.js';

// Machine-to-machine auth for the simulator: header X-Service-Token.
export const requireServiceToken: RequestHandler = (req, _res, next) => {
  const expected = Buffer.from(process.env.SERVICE_TOKEN ?? '');
  const given = Buffer.from(req.header('x-service-token') ?? '');
  const ok = expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
  if (!ok) return next(new AppError(401, 'UNAUTHENTICATED', 'Invalid service token'));
  next();
};