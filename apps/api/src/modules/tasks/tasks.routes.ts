import { Router } from 'express';
import { z } from 'zod';
import { LICENSE_CATEGORIES } from '@aeroguard/shared';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { PRIORITIES } from '../../common/priority.js';
import { TASK_STATUSES } from '../../common/stateMachines.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { actorFrom } from '../audit/audit.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { createTask, getTask, listTasks } from './tasks.service.js';

const query = pageQuery.extend({
  status: z.enum(TASK_STATUSES).optional(),
  aircraftId: objectIdSchema.optional(),
  priority: z.enum(PRIORITIES).optional(),
});

const createSchema = z.object({
  aircraftId: objectIdSchema,
  componentId: objectIdSchema.optional(),
  sourceType: z.enum(['PROGRAMME', 'AD', 'MEL']),
  title: z.string().min(3),
  ataChapter: z.number().int().min(1).max(99),
  requiredLicense: z.enum(LICENSE_CATEGORIES),
  estimatedDurationHours: z.number().positive().max(200),
  dueLimit: z
    .object({
      date: z.coerce.date().optional(),
      fh: z.number().positive().optional(),
      fc: z.number().positive().optional(),
    })
    .refine((d) => d.date || d.fh !== undefined || d.fc !== undefined, {
      message: 'Provide at least one of date, fh or fc',
    }),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
});

export const tasksRouter = () => {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      res.json(await listTasks(query.parse(req.query)));
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      res.json(await getTask(objectIdSchema.parse(String(req.params.id))));
    }),
  );

  // Alert-driven tasks are created by approving an alert; this is for programme, AD and MEL tasks.
  router.post(
    '/',
    requireRole('ENGINEER', 'PLANNER'),
    asyncHandler(async (req, res) => {
      const task = await createTask(createSchema.parse(req.body), actorFrom(res));
      res.status(201).json(task);
    }),
  );

  return router;
};