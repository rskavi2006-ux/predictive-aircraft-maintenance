import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { actorFrom } from '../audit/audit.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { COMPLIANCE_KINDS, COMPLIANCE_STATUSES } from './compliance.model.js';
import { complianceSummary, listCompliance, runComplianceCheck } from './compliance.service.js';

const query = pageQuery.extend({
  status: z.enum(COMPLIANCE_STATUSES).optional(),
  kind: z.enum(COMPLIANCE_KINDS).optional(),
  aircraftId: objectIdSchema.optional(),
});
const soon = z.object({ dueSoonDays: z.coerce.number().int().min(1).max(90).default(7) });

export const complianceRouter = () => {
  const router = Router();
  router.use(requireAuth); // every role can read

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listCompliance(query.parse(req.query)));
    }),
  );

  router.get(
    '/summary',
    asyncHandler(async (req, res) => {
      res.json(await complianceSummary(soon.parse(req.query).dueSoonDays));
    }),
  );

  // Manual trigger of the daily check (it also runs on a timer inside the API).
  router.post(
    '/run-check',
    requireRole('ADMIN', 'PLANNER'),
    asyncHandler(async (req, res) => {
      const { dueSoonDays } = soon.parse(req.body ?? {});
      res.json(await runComplianceCheck({ dueSoonDays, ctx: actorFrom(res) }));
    }),
  );

  return router;
};