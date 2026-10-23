import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { AuditModel } from '../audit/audit.model.js';
import { UserModel } from './user.model.js';
import { createUser } from './users.service.js';

process.env.JWT_ACCESS_SECRET = 'test-secret-123456';

// Integration test: needs the local MongoDB container. Skipped automatically when it is not running.
const uri = process.env.MONGO_TEST_URI_USERS ?? 'mongodb://localhost:27017/aeroguard_test_users';
let available = true;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
} catch {
  available = false;
}

describe.skipIf(!available)('username login and role changes (needs MongoDB)', () => {
  const app = createApp({ logger: pino({ level: 'silent' }), corsOrigins: [], checks: {} });
  const PASSWORD = 'Passw0rd!demo';
  let adminId = '';
  let plannerId = '';
  let adminToken = '';
  let engineerToken = '';

  const login = (username: string, password = PASSWORD) =>
    request(app).post('/api/v1/auth/login').send({ username, password });
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await UserModel.syncIndexes();
    adminId = (await createUser({ name: 'Admin', username: 'admin', password: PASSWORD, role: 'ADMIN' })).id;
    await createUser({ name: 'Eng', username: 'eng1', password: PASSWORD, role: 'ENGINEER', licenseCategory: 'B1' });
    plannerId = (await createUser({ name: 'Plan', username: 'plan1', password: PASSWORD, role: 'PLANNER' })).id;
    adminToken = (await login('admin')).body.token;
    engineerToken = (await login('eng1')).body.token;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('logs in with a username and never returns the password hash', async () => {
    const res = await login('admin');
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('is not case sensitive for the username', async () => {
    expect((await login('ADMIN')).status).toBe(200);
  });

  it('rejects a wrong password and an unknown username the same way', async () => {
    const wrong = await login('admin', 'wrong-password');
    const unknown = await login('nobody');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('no longer accepts an email-style login body', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.com', password: PASSWORD });
    expect(res.status).toBe(400);
  });

  it('only lets an admin manage users', async () => {
    const res = await request(app).get('/api/v1/users').set(auth(engineerToken));
    expect(res.status).toBe(403);
  });

  it('creates a user and rejects a duplicate username', async () => {
    const body = { name: 'Aud', username: 'aud1', password: PASSWORD, role: 'AUDITOR' };
    const first = await request(app).post('/api/v1/users').set(auth(adminToken)).send(body);
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/v1/users').set(auth(adminToken)).send(body);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('requires a licence category when the new role is ENGINEER', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${plannerId}`)
      .set(auth(adminToken))
      .send({ role: 'ENGINEER' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('changes a role, and the change is audit-logged', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${plannerId}`)
      .set(auth(adminToken))
      .send({ role: 'ENGINEER', licenseCategory: 'B2' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ENGINEER');
    expect(res.body.licenseCategory).toBe('B2');
    expect(await AuditModel.countDocuments({ action: 'user.role.change' })).toBe(1);
  });

  it('clears the licence category when a user stops being an engineer', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${plannerId}`)
      .set(auth(adminToken))
      .send({ role: 'PLANNER' });
    expect(res.status).toBe(200);
    expect(res.body.licenseCategory).toBeUndefined();
  });

  it('does not let an admin change their own role', async () => {
    const res = await request(app)
      .patch(`/api/v1/users/${adminId}`)
      .set(auth(adminToken))
      .send({ role: 'PLANNER' });
    expect(res.status).toBe(400);
  });
});