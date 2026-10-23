import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { WORK_ORDER_STATUSES } from '../../common/stateMachines.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getWorkOrder, listWorkOrders } from './workorders.service.js';

const query = pageQuery.extend({
  status: z.enum(WORK_ORDER_STATUSES).optional(),
  aircraftId: objectIdSchema.optional(),
});

export const workOrdersRouter = () => {
  const router = Router();
  router.use(requireAuth); // every role can read; sign-off is added in the next step
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
  return router;
};