import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { AuditModel } from '../audit/audit.model.js';
import { AircraftModel } from '../fleet/aircraft.model.js';
import { TaskModel } from '../tasks/task.model.js';
import { WindowModel } from './window.model.js';

const SECRET = 'test-secret-123456';
process.env.JWT_ACCESS_SECRET = SECRET;

// Integration test: needs the local MongoDB container. Skipped automatically when it is not running.
const uri = process.env.MONGO_TEST_URI_SCHEDULING ?? 'mongodb://localhost:27017/aeroguard_test_scheduling';
let available = true;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
} catch {
  available = false;
}

const token = (role: string) => jwt.sign({ role, name: role }, SECRET, { subject: `${role}-1`, expiresIn: '5m' });
const as = (role: string) => ({ Authorization: `Bearer ${token(role)}` });
const day = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * day);

describe.skipIf(!available)('scheduling (needs MongoDB)', () => {
  const app = createApp({ logger: pino({ level: 'silent' }), corsOrigins: [], checks: {} });
  let aircraftId = '';
  let windowId = '';
  const start = inDays(3);
  const windowBody = () => ({
    aircraftId,
    type: 'BASE',
    station: 'MAA',
    start: start.toISOString(),
    end: new Date(start.getTime() + 14 * 3_600_000).toISOString(),
    capacityHours: 12,
  });
  const newTask = (title: string, dueInDays: number) =>
    TaskModel.create({
      aircraftId: new mongoose.Types.ObjectId(aircraftId),
      sourceType: 'PROGRAMME',
      title,
      ataChapter: 29,
      requiredLicense: 'B1',
      estimatedDurationHours: 3,
      dueLimit: { date: inDays(dueInDays) },
      estimatedDueDate: inDays(dueInDays),
      priority: 'MEDIUM',
    });

  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    const aircraft = await AircraftModel.create({ registration: 'VT-SCHD', type: 'SIM', msn: '1', baseStation: 'MAA' });
    aircraftId = String(aircraft._id);
    await newTask('Task one', 10);
    await newTask('Task two', 10);
    await newTask('Too early', 1); // due before the window starts
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('only lets a planner create windows', async () => {
    const res = await request(app).post('/api/v1/scheduling/windows').set(as('ENGINEER')).send(windowBody());
    expect(res.status).toBe(403);
  });

  it('rejects a window whose capacity is longer than the window itself', async () => {
    const body = { ...windowBody(), end: new Date(start.getTime() + 5 * 3_600_000).toISOString() };
    const res = await request(app).post('/api/v1/scheduling/windows').set(as('PLANNER')).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('creates a window', async () => {
    const res = await request(app).post('/api/v1/scheduling/windows').set(as('PLANNER')).send(windowBody());
    expect(res.status).toBe(201);
    expect(res.body.registration).toBe('VT-SCHD');
    expect(res.body.bookedHours).toBe(0);
    windowId = res.body._id;
  });

  it('previews one bundled window with downtime saved, and flags the task that would miss its limit', async () => {
    const res = await request(app).post('/api/v1/scheduling/preview').set(as('AUDITOR')).send({});
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].tasks).toHaveLength(2);
    expect(res.body.items[0].hoursUsed).toBe(6);
    expect(res.body.items[0].downtimeSavedHours).toBe(4);
    expect(res.body.unscheduled).toHaveLength(1);
    expect(res.body.unscheduled[0].reason).toBe('NO_WINDOW_BEFORE_DUE');
  });

  it('changes nothing until a planner confirms', async () => {
    expect(await TaskModel.countDocuments({ status: 'PENDING' })).toBe(3);
    expect(await TaskModel.countDocuments({ status: 'SCHEDULED' })).toBe(0);
  });

  it('only lets a planner confirm', async () => {
    const res = await request(app).post('/api/v1/scheduling/confirm').set(as('ENGINEER')).send({ windowId });
    expect(res.status).toBe(403);
  });

  it('confirm creates a work order, schedules the tasks, books the window and audits it', async () => {
    const res = await request(app).post('/api/v1/scheduling/confirm').set(as('PLANNER')).send({ windowId });
    expect(res.status).toBe(200);
    expect(res.body.workOrder.status).toBe('OPEN');
    expect(res.body.workOrder.number).toMatch(/^WO-[0-9A-F]{6}$/);
    expect(res.body.plan.downtimeSavedHours).toBe(4);
    expect(await TaskModel.countDocuments({ status: 'SCHEDULED' })).toBe(2);
    expect((await WindowModel.findById(windowId))?.bookedHours).toBe(6);
    expect(await AuditModel.countDocuments({ action: 'scheduling.confirm' })).toBe(1);
  });

  it('cannot confirm the same window twice', async () => {
    const res = await request(app).post('/api/v1/scheduling/confirm').set(as('PLANNER')).send({ windowId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_IN_PLAN');
  });

  it('does not cancel a window that already has scheduled work', async () => {
    const res = await request(app).post(`/api/v1/scheduling/windows/${windowId}/cancel`).set(as('PLANNER'));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WINDOW_BOOKED');
  });

  it('lets any signed-in role read the work order that was created', async () => {
    const res = await request(app).get('/api/v1/work-orders').set(as('AUDITOR'));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0].taskIds).toHaveLength(2);
  });
});