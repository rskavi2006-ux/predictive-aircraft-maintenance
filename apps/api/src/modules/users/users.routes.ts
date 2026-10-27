import { Router } from 'express';
import { z } from 'zod';
import { LICENSE_CATEGORIES, ROLES } from '@aeroguard/shared';
import { objectIdSchema, pageQuery } from '../../common/pagination.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { AppError } from '../../middleware/errorHandler.js';
import { actorFrom, record } from '../audit/audit.service.js';
import { requireAuth, requireRole, type AuthUser } from '../auth/auth.middleware.js';
import { createUser, listUsers, updateUser } from './users.service.js';

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,30}$/, 'Use 3 to 30 characters: letters, digits, dot, dash or underscore');

const createSchema = z
  .object({
    name: z.string().min(1),
    username: usernameSchema,
    email: z.string().email().optional(),
    password: z.string().min(8),
    role: z.enum(ROLES),
    licenseCategory: z.enum(LICENSE_CATEGORIES).optional(),
  })
  .refine((v) => v.role !== 'ENGINEER' || v.licenseCategory, {
    message: 'licenseCategory (B1 or B2) is required for ENGINEER',
    path: ['licenseCategory'],
  });

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  role: z.enum(ROLES).optional(),
  licenseCategory: z.enum(LICENSE_CATEGORIES).optional(),
});

export const usersRouter = () => {
  const router = Router();
  router.use(requireAuth, requireRole('ADMIN'));

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const { page, limit } = pageQuery.parse(req.query);
      res.json(await listUsers(page, limit));
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const user = await createUser(createSchema.parse(req.body));
      await record({
        ...actorFrom(res),
        action: 'user.create',
        entityType: 'User',
        entityId: user.id,
        after: user,
      });
      res.status(201).json(user);
    }),
  );

  // Admin can rename, deactivate and change a user's role (an engineer needs B1 or B2).
  router.patch(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = objectIdSchema.parse(String(req.params.id));
      const patch = patchSchema.parse(req.body);
      const me = res.locals.user as AuthUser;
      const changesOwnRole = patch.role !== undefined && patch.role !== me.role;
      if (id === me.id && (patch.isActive === false || changesOwnRole)) {
        throw new AppError(400, 'BAD_REQUEST', 'You cannot change your own role or deactivate yourself');
      }
      const { before, after } = await updateUser(id, patch);
      const action = before.role !== after.role ? 'user.role.change' : 'user.update';
      await record({ ...actorFrom(res), action, entityType: 'User', entityId: id, before, after });
      res.json(after);
    }),
  );

  return router;
};