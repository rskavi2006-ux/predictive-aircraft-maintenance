import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import { getActiveUser } from '../users/users.service.js';
import { requireAuth, type AuthUser } from './auth.middleware.js';
import { login } from './auth.service.js';

const loginSchema = z.object({ username: z.string().trim().min(1), password: z.string().min(1) });

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'Too many login attempts, try later')),
});

export const authRouter = () => {
  const router = Router();

  router.post(
    '/login',
    loginLimiter,
    asyncHandler(async (req, res) => {
      const body = loginSchema.parse(req.body);
      const result = await login(body.username, body.password);
      if (!result) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      await record({
        actorId: result.user.id,
        actorRole: result.user.role,
        action: 'auth.login',
        entityType: 'User',
        entityId: result.user.id,
        requestId: res.locals.requestId as string | undefined,
      });
      res.json(result);
    }),
  );

  router.get(
    '/me',
    requireAuth,
    asyncHandler(async (_req, res) => {
      const me = res.locals.user as AuthUser;
      const user = await getActiveUser(me.id);
      if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Account not found or deactivated');
      res.json({ user });
    }),
  );

  return router;
};