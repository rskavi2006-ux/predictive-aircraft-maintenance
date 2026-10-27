import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { requireServiceToken } from '../auth/serviceToken.js';
import { batchSchema, readingsQuery } from './telemetry.schema.js';
import { ingestBatch, listTargets, queryReadings } from './telemetry.service.js';

export const telemetryRouter = () => {
  const router = Router();

  router.post(
    '/batch',
    requireServiceToken,
    asyncHandler(async (req, res) => {
      res.json(await ingestBatch(batchSchema.parse(req.body).readings));
    }),
  );

  router.get(
    '/targets',
    requireServiceToken,
    asyncHandler(async (_req, res) => {
      res.json({ targets: await listTargets() });
    }),
  );

  router.get(
    '/',
    requireAuth,
    asyncHandler(async (req, res) => {
      res.json(await queryReadings(readingsQuery.parse(req.query)));
    }),
  );

  return router;
};