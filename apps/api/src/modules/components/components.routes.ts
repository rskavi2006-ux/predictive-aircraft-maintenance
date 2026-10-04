import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getComponent, listComponents } from './components.service.js';

const query = pageQuery.extend({
  aircraftId: objectIdSchema.optional(),
  ataChapter: z.coerce.number().int().optional(),
  kind: z.enum(['LRU', 'LLP']).optional(),
  status: z.enum(['INSTALLED', 'REMOVED']).optional(),
});

export const componentsRouter = () => {
  const router = Router();
  router.use(requireAuth);
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listComponents(query.parse(req.query)));
    }),
  );
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json(await getComponent(objectIdSchema.parse(String(req.params.id))));
    }),
  );
  return router;
};