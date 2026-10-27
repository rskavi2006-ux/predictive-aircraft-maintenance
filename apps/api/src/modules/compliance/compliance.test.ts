import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { AuditModel } from '../audit/audit.model.js';
import { AircraftModel } from '../fleet/aircraft.model.js';
import { TaskModel } from '../tasks/task.model.js';
import { ComplianceModel } from './compliance.model.js';
import { runComplianceCheck } from './compliance.service.js';

const SECRET = 'test-secret-123456';
process.env.JWT_ACCESS_SECRET = SECRET;

// Integration test: needs the local MongoDB container. Skipped automatically when it is not running.
const uri = process.env.MONGO_TEST_URI_COMPLIANCE ?? 'mongodb://localhost:27017/aeroguard_test_compliance';
let available = true;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
} catch {
  available = false;
}

const as = (role: string) => ({
  Authorization: `Bearer ${jwt.sign({ role, name: role }, SECRET, { subject: `${role}-1`, expiresIn: '5m' })}`,
});
const day = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * day);

describe.skipIf(!available)('compliance check (needs MongoDB)', () => {
  const app = createApp({ logger: pino({ level: 'silent' }), corsOrigins: [], checks: {} });
  let aircraftId = '';

  const makeTask = (title: string, dueInDays: number, status: string) =>
    TaskModel.create({
      aircraftId, sourceType: 'PROGRAMME', title, ataChapter: 29, requiredLicense: 'B1',
      estimatedDurationHours: 3, estimatedDueDate: inDays(dueInDays), priority: 'MEDIUM', status,
    });

  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await ComplianceModel.syncIndexes();
    aircraftId = String((await AircraftModel.create({ registration: 'VT-CMP', type: 'SIM', msn: '1', baseStation: 'MAA' }))._id);
    await makeTask('Past due task', -2, 'SCHEDULED');
    await makeTask('Soon task', 3, 'PENDING');
    await makeTask('Far task', 30, 'PENDING');
    const done = await makeTask('Finished task', -10, 'DONE');
    await ComplianceModel.create({
      aircraftId, taskId: done._id, kind: 'PROGRAMME', reference: 'DONE-1', dueDate: inDays(-10), status: 'COMPLIED',
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('creates records for active tasks, marks overdue ones and lists items due soon', async () => {
    const result = await runComplianceCheck({ dueSoonDays: 7 });
    expect(result.created).toBe(3);
    expect(result.markedOverdue).toBe(1);
    expect(result.dueSoon).toHaveLength(1);
    expect(result.dueSoon[0].title).toBe('Soon task');
    expect(await ComplianceModel.countDocuments({ status: 'OVERDUE' })).toBe(1);
  });

  it('never touches an item that is already complied with', async () => {
    const complied = await ComplianceModel.findOne({ reference: 'DONE-1' });
    expect(complied?.status).toBe('COMPLIED');
  });

  it('is idempotent when run again', async () => {
    const again = await runComplianceCheck({ dueSoonDays: 7 });
    expect(again.created).toBe(0);
    expect(again.markedOverdue).toBe(0);
  });

  it('audit-logs the overdue change and each run', async () => {
    expect(await AuditModel.countDocuments({ action: 'compliance.overdue' })).toBe(1);
    expect(await AuditModel.countDocuments({ action: 'compliance.check' })).toBe(2);
  });

  it('serves a summary to any signed-in role', async () => {
    const res = await request(app).get('/api/v1/compliance/summary').set(as('AUDITOR'));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ open: 2, complied: 1, overdue: 1, dueSoon: 1 });
  });

  it('lists records filtered by status', async () => {
    const res = await request(app).get('/api/v1/compliance').query({ status: 'OVERDUE' }).set(as('ENGINEER'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].title).toBe('Past due task');
  });

  it('only lets an admin or planner trigger the check', async () => {
    expect((await request(app).post('/api/v1/compliance/run-check').set(as('ENGINEER'))).status).toBe(403);
    expect((await request(app).post('/api/v1/compliance/run-check').set(as('PLANNER'))).status).toBe(200);
  });
});