import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { AuditModel } from '../audit/audit.model.js';
import { ComplianceModel } from '../compliance/compliance.model.js';
import { ComponentModel } from '../components/component.model.js';
import { AircraftModel } from '../fleet/aircraft.model.js';
import { WindowModel } from '../scheduling/window.model.js';
import { TaskModel } from '../tasks/task.model.js';
import { WorkOrderModel } from './workorder.model.js';

const SECRET = 'test-secret-123456';
process.env.JWT_ACCESS_SECRET = SECRET;

// Integration test: needs the local MongoDB container. Skipped automatically when it is not running.
const uri = process.env.MONGO_TEST_URI_WORKORDERS ?? 'mongodb://localhost:27017/aeroguard_test_workorders';
let available = true;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
} catch {
  available = false;
}

const token = (role: string, lic?: string) =>
  jwt.sign({ role, name: role, lic }, SECRET, { subject: `${role}-${lic ?? 'x'}`, expiresIn: '5m' });
const as = (role: string, lic?: string) => ({ Authorization: `Bearer ${token(role, lic)}` });
const day = 86_400_000;

describe.skipIf(!available)('work orders and sign-off (needs MongoDB)', () => {
  const app = createApp({ logger: pino({ level: 'silent' }), corsOrigins: [], checks: {} });
  let woId = '';
  let windowId = '';
  let componentId = '';
  const url = (action: string) => `/api/v1/work-orders/${woId}/${action}`;

  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await ComplianceModel.syncIndexes();
    const aircraft = await AircraftModel.create({ registration: 'VT-WO', type: 'SIM', msn: '1', baseStation: 'MAA' });
    const component = await ComponentModel.create({
      aircraftId: aircraft._id, partNumber: 'P-1', serialNumber: 'S-1', name: 'Pump', ataChapter: 29, kind: 'LRU',
    });
    componentId = String(component._id);
    const win = await WindowModel.create({
      aircraftId: aircraft._id, type: 'BASE', station: 'MAA',
      start: new Date(Date.now() + 3 * day), end: new Date(Date.now() + 4 * day), capacityHours: 12, bookedHours: 6,
    });
    windowId = String(win._id);
    const makeTask = (title: string) =>
      TaskModel.create({
        aircraftId: aircraft._id, componentId: component._id, sourceType: 'PROGRAMME', title, ataChapter: 29,
        requiredLicense: 'B1', estimatedDurationHours: 3, estimatedDueDate: new Date(Date.now() + 10 * day),
        priority: 'MEDIUM', status: 'SCHEDULED',
      });
    const [t1, t2] = [await makeTask('Task one'), await makeTask('Task two')];
    const wo = await WorkOrderModel.create({
      number: 'WO-TEST01', aircraftId: aircraft._id, windowId: win._id, taskIds: [t1._id, t2._id],
    });
    woId = String(wo._id);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('cannot sign off a work order that has not been started', async () => {
    const res = await request(app).post(url('sign-off')).set(as('ENGINEER', 'B1')).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('only lets an engineer start the work', async () => {
    const res = await request(app).post(url('start')).set(as('PLANNER'));
    expect(res.status).toBe(403);
  });

  it('starting moves the work order, its tasks and the window forward', async () => {
    const res = await request(app).post(url('start')).set(as('ENGINEER', 'B1'));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
    expect(await TaskModel.countDocuments({ status: 'IN_PROGRESS' })).toBe(2);
    expect((await WindowModel.findById(windowId))?.status).toBe('ACTIVE');
  });

  it('records findings while the work is in progress', async () => {
    const short = await request(app).post(url('findings')).set(as('ENGINEER', 'B1')).send({ text: 'ab' });
    expect(short.status).toBe(400);
    const ok = await request(app)
      .post(url('findings'))
      .set(as('ENGINEER', 'B1'))
      .send({ text: 'Minor corrosion on bracket, treated' });
    expect(ok.status).toBe(200);
    expect(ok.body.findings).toHaveLength(1);
  });

  it('rejects a sign-off from an engineer with the wrong licence category', async () => {
    const res = await request(app).post(url('sign-off')).set(as('ENGINEER', 'B2')).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LICENCE_MISMATCH');
  });

  it('rejects a sign-off from a planner', async () => {
    const res = await request(app).post(url('sign-off')).set(as('PLANNER')).send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('sign-off completes the tasks, records compliance and closes the window', async () => {
    const res = await request(app).post(url('sign-off')).set(as('ENGINEER', 'B1')).send({ remarks: 'Release to service' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    expect(res.body.signedOffBy).toBe('ENGINEER-B1');
    expect(await TaskModel.countDocuments({ status: 'DONE' })).toBe(2);
    expect((await ComponentModel.findById(componentId))?.lastServicedAt).toBeDefined();
    const records = await ComplianceModel.find({ status: 'COMPLIED' });
    expect(records).toHaveLength(2);
    expect(String(records[0].evidenceWorkOrderId)).toBe(woId);
    expect(records[0].kind).toBe('PROGRAMME');
    expect((await WindowModel.findById(windowId))?.status).toBe('COMPLETED');
    expect(await AuditModel.countDocuments({ action: 'workorder.signoff' })).toBe(1);
  });

  it('cannot be signed off twice', async () => {
    const res = await request(app).post(url('sign-off')).set(as('ENGINEER', 'B1')).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });
});