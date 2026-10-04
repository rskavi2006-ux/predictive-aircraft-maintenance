import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { listByAircraft } from '../components/components.service.js';
import { AIRCRAFT_STATUSES } from './aircraft.model.js';
import { getAircraft, listAircraft } from './fleet.service.js';

const query = pageQuery.extend({
  search: z.string().optional(),
  status: z.enum(AIRCRAFT_STATUSES).optional(),
});

export const fleetRouter = () => {
  const router = Router();
  router.use(requireAuth); // all authenticated roles can read
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listAircraft(query.parse(req.query)));
    }),
  );
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = objectIdSchema.parse(String(req.params.id));
      const aircraft = await getAircraft(id);
      const components = await listByAircraft(id); // via the components service, not its model
      res.json({ aircraft, components });
    }),
  );
  return router;
};