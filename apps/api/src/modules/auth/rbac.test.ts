import express from 'express';
import jwt from 'jsonwebtoken';
import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ROLES } from '@aeroguard/shared';
import { errorHandler } from '../../middleware/errorHandler.js';
import { requireAuth, requireRole } from './auth.middleware.js';

const SECRET = 'test-secret-123456';
process.env.JWT_ACCESS_SECRET = SECRET;

const tokenFor = (role: string) =>
  jwt.sign({ role, name: 'Test' }, SECRET, { subject: 'user-1', expiresIn: '5m' });

function buildApp() {
  const app = express();
  app.get('/open', requireAuth, (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/engineer-only', requireAuth, requireRole('ENGINEER'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler(pino({ level: 'silent' })));
  return app;
}

describe('requireAuth', () => {
  it('rejects a missing token', async () => {
    const res = await request(buildApp()).get('/open');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a garbage token', async () => {
    const res = await request(buildApp()).get('/open').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });

  it('accepts a valid token', async () => {
    const res = await request(buildApp())
      .get('/open')
      .set('Authorization', `Bearer ${tokenFor('PLANNER')}`);
    expect(res.status).toBe(200);
  });
});

describe('requireRole', () => {
  it.each(ROLES)('role %s on an ENGINEER-only route', async (role) => {
    const res = await request(buildApp())
      .get('/engineer-only')
      .set('Authorization', `Bearer ${tokenFor(role)}`);
    if (role === 'ENGINEER') {
      expect(res.status).toBe(200);
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });
});