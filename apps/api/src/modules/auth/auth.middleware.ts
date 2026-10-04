import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { LicenseCategory, Role } from '@aeroguard/shared';
import { AppError } from '../../middleware/errorHandler.js';
import { jwtSecret } from './auth.config.js';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  licenseCategory?: LicenseCategory;
}

interface TokenPayload {
  sub: string;
  name: string;
  role: Role;
  lic?: LicenseCategory;
}

function verifyToken(token: string): AuthUser | null {
  try {
    const p = jwt.verify(token, jwtSecret()) as unknown as TokenPayload;
    return { id: p.sub, name: p.name, role: p.role, licenseCategory: p.lic };
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? verifyToken(token) : null;
  if (!user) return next(new AppError(401, 'UNAUTHENTICATED', 'Missing, invalid or expired token'));
  res.locals.user = user;
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (_req, res, next) => {
    const user = res.locals.user as AuthUser | undefined;
    if (!user) return next(new AppError(401, 'UNAUTHENTICATED', 'Not signed in'));
    if (!roles.includes(user.role)) {
      return next(new AppError(403, 'FORBIDDEN', `Requires role: ${roles.join(' or ')}`));
    }
    next();
  };