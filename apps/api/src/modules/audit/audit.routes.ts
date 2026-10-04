import { Router } from 'express';
import { z } from 'zod';
import { pageQuery } from '../../common/pagination.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { listAudit } from './audit.service.js';

const query = pageQuery.extend({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  actorId: z.string().optional(),
});

// Read-only. There is intentionally no write endpoint.
export const auditRouter = () => {
  const router = Router();
  router.use(requireAuth, requireRole('AUDITOR', 'ADMIN'));
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listAudit(query.parse(req.query)));
    }),
  );
  return router;
};