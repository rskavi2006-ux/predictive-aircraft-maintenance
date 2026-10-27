import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { AuditModel } from '../audit/audit.model.js';
import { ComponentModel } from '../components/component.model.js';
import { AircraftModel } from '../fleet/aircraft.model.js';
import type { Prediction } from '../scoring/prediction.js';
import { AlertModel } from './alert.model.js';
import { evaluateAlert } from './alerts.service.js';

const SECRET = 'test-secret-123456';
process.env.JWT_ACCESS_SECRET = SECRET;

// Integration test: needs the local MongoDB container. Skipped automatically when it is not running.
const uri = process.env.MONGO_TEST_URI_ALERTS ?? 'mongodb://localhost:27017/aeroguard_test_alerts';
let available = true;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
} catch {
  available = false;
}

const bad = (healthScore: number, rulDays: number | null): Prediction => ({
  healthScore,
  failureProbability: 0.7,
  rulDays,
  confidence: 1,
  contributingFactors: [
    { metric: 'vibration', value: 5, nominal: 2, critical: 6, unit: 'mm/s', stress: 0.75, slopePerDay: 0.5, note: 'Vibration high' },
  ],
});
const token = (role: string) => jwt.sign({ role, name: role }, SECRET, { subject: `${role}-1`, expiresIn: '5m' });

describe.skipIf(!available)('alerts (needs MongoDB)', () => {
  const app = createApp({ logger: pino({ level: 'silent' }), corsOrigins: [], checks: {} });
  let compA = '';
  let compB = '';
  let alertId = '';

  const decide = (id: string, action: string, role: string, body: object) =>
    request(app).post(`/api/v1/alerts/${id}/${action}`).set('Authorization', `Bearer ${token(role)}`).send(body);

  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await AlertModel.syncIndexes();
    const aircraft = await AircraftModel.create({ registration: 'VT-ALRT', type: 'SIM', msn: '1', baseStation: 'MAA' });
    const a = await ComponentModel.create({
      aircraftId: aircraft._id, partNumber: 'P-A', serialNumber: 'S-A', name: 'Pump A', ataChapter: 29, kind: 'LRU',
    });
    const b = await ComponentModel.create({
      aircraftId: aircraft._id, partNumber: 'P-B', serialNumber: 'S-B', name: 'Pump B', ataChapter: 29, kind: 'LRU',
    });
    compA = String(a._id);
    compB = String(b._id);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('creates an alert with a priority and an explanation', async () => {
    const alert = await evaluateAlert(compA, bad(35, 3));
    expect(alert).not.toBeNull();
    alertId = String(alert?._id);
    expect(alert?.priority).toBe('HIGH');
    expect(alert?.registration).toBe('VT-ALRT');
    expect(alert?.contributingFactors).toHaveLength(1);
  });

  it('does not create a second alert for the same component and cause, but refreshes the open one', async () => {
    expect(await evaluateAlert(compA, bad(20, 1))).toBeNull();
    expect(await AlertModel.countDocuments({ componentId: compA })).toBe(1);
    const fresh = await AlertModel.findById(alertId);
    expect(fresh?.priority).toBe('AOG_RISK');
  });

  it('only lets an engineer decide', async () => {
    const res = await decide(alertId, 'approve', 'PLANNER', { note: 'looks real' });
    expect(res.status).toBe(403);
  });

  it('requires a note', async () => {
    const res = await decide(alertId, 'approve', 'ENGINEER', {});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('approving creates a pending task and an audit entry', async () => {
    const res = await decide(alertId, 'approve', 'ENGINEER', { note: 'Borescope inspection confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.alert.status).toBe('APPROVED');
    expect(res.body.task.status).toBe('PENDING');
    expect(res.body.task.requiredLicense).toBe('B1');
    expect(res.body.task.sourceType).toBe('ALERT');
    expect(await AuditModel.countDocuments({ action: 'alert.approve' })).toBe(1);
  });

  it('cannot decide the same alert twice', async () => {
    const res = await decide(alertId, 'reject', 'ENGINEER', { note: 'changed my mind' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('raises no new alert while the approved task is still open', async () => {
    expect(await evaluateAlert(compA, bad(20, 1))).toBeNull();
    expect(await AlertModel.countDocuments({ componentId: compA })).toBe(1);
  });

  it('keeps a deferred alert active, then allows a new one after a rejection', async () => {
    const first = await evaluateAlert(compB, bad(45, 5));
    const idB = String(first?._id);
    const deferred = await decide(idB, 'defer', 'ENGINEER', { note: 'wait for next flight data' });
    expect(deferred.body.alert.status).toBe('DEFERRED');
    expect(await evaluateAlert(compB, bad(45, 5))).toBeNull();

    const rejected = await decide(idB, 'reject', 'ENGINEER', { note: 'sensor glitch' });
    expect(rejected.body.alert.status).toBe('REJECTED');
    expect(await evaluateAlert(compB, bad(45, 5))).not.toBeNull();
  });
});