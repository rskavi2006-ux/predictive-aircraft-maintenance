import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { pino } from 'pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { ComponentModel } from '../components/component.model.js';
import { AircraftModel } from '../fleet/aircraft.model.js';
import { HealthScoreModel } from '../scoring/scoring.model.js';
import { ReadingModel } from './telemetry.model.js';

const SERVICE_TOKEN = 'test-service-token';
const JWT_SECRET = 'test-secret-123456';
process.env.SERVICE_TOKEN = SERVICE_TOKEN;
process.env.JWT_ACCESS_SECRET = JWT_SECRET;

// Integration test: needs the local MongoDB container. Skipped automatically when it is not running.
const uri = process.env.MONGO_TEST_URI ?? 'mongodb://localhost:27017/aeroguard_test';
let available = true;
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 1500 });
} catch {
  available = false;
}

describe.skipIf(!available)('telemetry ingest (needs MongoDB)', () => {
  const app = createApp({ logger: pino({ level: 'silent' }), corsOrigins: [], checks: {} });
  let componentId = '';

  const readings = () =>
    [0, 1, 2].map((i) => ({
      componentId,
      timestamp: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
      vibration: 2 + i * 0.01,
      egt: 600,
    }));
  const post = (body: unknown) =>
    request(app).post('/api/v1/telemetry/batch').set('x-service-token', SERVICE_TOKEN).send(body as object);

  beforeAll(async () => {
    await mongoose.connection.dropDatabase();
    await ReadingModel.syncIndexes();
    await HealthScoreModel.syncIndexes();
    const aircraft = await AircraftModel.create({ registration: 'VT-TEST', type: 'SIM', msn: '1', baseStation: 'MAA' });
    const component = await ComponentModel.create({
      aircraftId: aircraft._id,
      partNumber: 'P-1',
      serialNumber: 'S-1',
      name: 'Test Pump',
      ataChapter: 29,
      kind: 'LRU',
    });
    componentId = String(component._id);
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('rejects a missing service token', async () => {
    const res = await request(app).post('/api/v1/telemetry/batch').send({ readings: readings() });
    expect(res.status).toBe(401);
  });

  it('rejects an invalid payload', async () => {
    const res = await post({ readings: [{ componentId: 'nope', timestamp: 'x', vibration: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown components', async () => {
    const res = await post({
      readings: [{ componentId: '0'.repeat(24), timestamp: new Date().toISOString(), vibration: 1 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_COMPONENT');
  });

  it('inserts once and ignores a duplicate batch', async () => {
    const first = await post({ readings: readings() });
    expect(first.status).toBe(200);
    expect(first.body.inserted).toBe(3);
    const second = await post({ readings: readings() });
    expect(second.body.inserted).toBe(0);
    expect(second.body.duplicates).toBe(3);
    expect(await ReadingModel.countDocuments({})).toBe(3);
  });

  it('scores the component after ingest', async () => {
    const score = await HealthScoreModel.findOne({});
    expect(score?.healthScore).toBeGreaterThan(90);
  });

  it('returns readings to an authenticated user and downsamples them', async () => {
    const token = jwt.sign({ role: 'ENGINEER', name: 'T' }, JWT_SECRET, { subject: 'u1' });
    const res = await request(app)
      .get('/api/v1/telemetry')
      .set('Authorization', `Bearer ${token}`)
      .query({ componentId, maxPoints: 10 });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(3);
  });
});