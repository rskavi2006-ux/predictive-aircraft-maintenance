import { Router } from 'express';
import { z } from 'zod';
import { LICENSE_CATEGORIES } from '@aeroguard/shared';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { WINDOW_STATUSES } from '../../common/stateMachines.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { actorFrom } from '../audit/audit.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { DEFAULT_OVERHEAD_HOURS } from './scheduler.js';
import { buildPreview, cancelWindow, confirmWindow, createWindow, listWindows } from './scheduling.service.js';
import { WINDOW_TYPES } from './window.model.js';

const listQuery = pageQuery.extend({
  aircraftId: objectIdSchema.optional(),
  status: z.enum(WINDOW_STATUSES).optional(),
});

const createSchema = z
  .object({
    aircraftId: objectIdSchema,
    type: z.enum(WINDOW_TYPES),
    station: z.string().trim().min(2),
    start: z.coerce.date(),
    end: z.coerce.date(),
    capacityHours: z.number().positive().max(200),
    licences: z.array(z.enum(LICENSE_CATEGORIES)).min(1).optional(),
  })
  .refine((v) => v.end > v.start, { message: 'end must be after start', path: ['end'] })
  .refine((v) => v.capacityHours <= (v.end.getTime() - v.start.getTime()) / 3_600_000, {
    message: 'capacityHours cannot exceed the window length',
    path: ['capacityHours'],
  });

const overhead = z.number().min(0).max(24).optional();
const previewBody = z.object({ overheadHours: overhead });
const confirmBody = z.object({ windowId: objectIdSchema, overheadHours: overhead });

export const schedulingRouter = () => {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/windows',
    asyncHandler(async (req, res) => {
      res.json(await listWindows(listQuery.parse(req.query)));
    }),
  );

  // The Planner decides WHEN work happens (separation of duties, ADR 0005).
  router.post(
    '/windows',
    requireRole('PLANNER'),
    asyncHandler(async (req, res) => {
      res.status(201).json(await createWindow(createSchema.parse(req.body), actorFrom(res)));
    }),
  );

  router.post(
    '/windows/:id/cancel',
    requireRole('PLANNER'),
    asyncHandler(async (req, res) => {
      res.json(await cancelWindow(objectIdSchema.parse(String(req.params.id)), actorFrom(res)));
    }),
  );

  // Read-only plan preview: every role may look.
  router.post(
    '/preview',
    asyncHandler(async (req, res) => {
      const body = previewBody.parse(req.body ?? {});
      res.json(await buildPreview(body.overheadHours ?? DEFAULT_OVERHEAD_HOURS));
    }),
  );

  router.post(
    '/confirm',
    requireRole('PLANNER'),
    asyncHandler(async (req, res) => {
      const body = confirmBody.parse(req.body);
      res.json(await confirmWindow(body.windowId, body.overheadHours ?? DEFAULT_OVERHEAD_HOURS, actorFrom(res)));
    }),
  );

  return router;
};