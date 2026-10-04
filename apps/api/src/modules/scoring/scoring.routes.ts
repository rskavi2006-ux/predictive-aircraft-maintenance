import { Router } from 'express';
import { objectIdSchema } from '../../common/pagination.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { listByAircraft } from '../components/components.service.js';
import { listAircraft } from '../fleet/fleet.service.js';
import { aircraftScores, componentScore, fleetSummary } from './scoring.service.js';

export const scoringRouter = () => {
  const router = Router();
  router.use(requireAuth); // every role can read health

  router.get(
    '/fleet',
    asyncHandler(async (_req, res) => {
      const [summary, aircraft] = await Promise.all([fleetSummary(), listAircraft({ page: 1, limit: 100 })]);
      const reg = new Map(aircraft.data.map((a) => [String(a._id), a.registration] as const));
      res.json({
        data: summary.map((s) => ({
          aircraftId: s._id ? String(s._id) : null,
          registration: s._id ? (reg.get(String(s._id)) ?? null) : null,
          minHealth: s.minHealth,
          componentsScored: s.componentsScored,
          atRisk: s.atRisk,
        })),
      });
    }),
  );

  router.get(
    '/aircraft/:id',
    asyncHandler(async (req, res) => {
      const id = objectIdSchema.parse(String(req.params.id));
      const [scores, components] = await Promise.all([aircraftScores(id), listByAircraft(id)]);
      const names = new Map(components.map((c) => [String(c._id), c.name] as const));
      res.json({
        data: scores.map((s) => ({ ...s, name: names.get(String(s.componentId)) ?? null })),
      });
    }),
  );

  router.get(
    '/component/:id',
    asyncHandler(async (req, res) => {
      res.json(await componentScore(objectIdSchema.parse(String(req.params.id))));
    }),
  );

  return router;
};