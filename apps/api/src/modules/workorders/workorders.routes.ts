import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { WORK_ORDER_STATUSES } from '../../common/stateMachines.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { actorFrom } from '../audit/audit.service.js';
import { requireAuth, requireRole, type AuthUser } from '../auth/auth.middleware.js';
import { addFinding, signOffWorkOrder, startWorkOrder } from './workorders.signoff.js';
import { getWorkOrder, listWorkOrders } from './workorders.service.js';

const query = pageQuery.extend({
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  aircraftId: objectIdSchema.optional(),
});
const findingBody = z.object({ text: z.string().trim().min(3, 'Describe the finding') });
const signoffBody = z.object({ remarks: z.string().trim().max(500).optional() });

export const workOrdersRouter = () => {
  const router = Router();
  router.use(requireAuth); // every role can read

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listWorkOrders(query.parse(req.query)));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json(await getWorkOrder(objectIdSchema.parse(String(req.params.id))));
    }),
  );

  // Only engineers execute and certify the work.
  router.post(
    '/:id/start',
    requireRole('ENGINEER'),
    asyncHandler(async (req, res) => {
      res.json(await startWorkOrder(objectIdSchema.parse(String(req.params.id)), actorFrom(res)));
    }),
  );

  router.post(
    '/:id/findings',
    requireRole('ENGINEER'),
    asyncHandler(async (req, res) => {
      const { text } = findingBody.parse(req.body);
      res.json(await addFinding(objectIdSchema.parse(String(req.params.id)), text, actorFrom(res)));
    }),
  );

  router.post(
    '/:id/sign-off',
    requireRole('ENGINEER'),
    asyncHandler(async (req, res) => {
      const me = res.locals.user as AuthUser;
      const { remarks } = signoffBody.parse(req.body ?? {});
      res.json(
        await signOffWorkOrder(
          objectIdSchema.parse(String(req.params.id)),
          { id: me.id, licenseCategory: me.licenseCategory },
          remarks,
          actorFrom(res),
        ),
      );
    }),
  );

  return router;
};