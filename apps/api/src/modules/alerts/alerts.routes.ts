import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { PRIORITIES } from '../../common/priority.js';
import { ALERT_STATUSES } from '../../common/stateMachines.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { actorFrom } from '../audit/audit.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { decideAlert, getAlert, listAlerts, type Decision } from './alerts.service.js';

const query = pageQuery.extend({
  status: z.enum(ALERT_STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  aircraftId: objectIdSchema.optional(),
  componentId: objectIdSchema.optional(),
});

const decisionBody = z.object({ note: z.string().trim().min(3, 'A decision note is required') });

export const alertsRouter = () => {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listAlerts(query.parse(req.query)));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json(await getAlert(objectIdSchema.parse(String(req.params.id))));
    }),
  );

  // Only engineers decide WHAT needs fixing (separation of duties, ADR 0005).
  const decisions: Decision[] = ['approve', 'reject', 'defer'];
  for (const decision of decisions) {
    router.post(
      `/:id/${decision}`,
      requireRole('ENGINEER'),
      asyncHandler(async (req, res) => {
        const id = objectIdSchema.parse(String(req.params.id));
        const { note } = decisionBody.parse(req.body);
        res.json(await decideAlert(id, decision, note, actorFrom(res)));
      }),
    );
  }

  return router;
};