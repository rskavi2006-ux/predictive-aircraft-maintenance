import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { ComponentModel } from './modules/components/component.model.js';
import { AircraftModel } from './modules/fleet/aircraft.model.js';
import { UserModel } from './modules/users/user.model.js';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // no .env file; rely on real environment variables
}

if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed in production');

const DEMO_PASSWORD = 'Passw0rd!demo';
const STATIONS = ['MAA', 'BLR', 'DEL', 'HYD', 'BOM'];

interface Template {
  name: string;
  ata: number;
  kind: 'LRU' | 'LLP';
  prefix: string;
  maxFH?: number;
  maxFC?: number;
}

// Fictional parts and limits for the simulator. TODO: verify before any real-world use.
const TEMPLATES: Template[] = [
  { name: 'Engine 1', ata: 72, kind: 'LRU', prefix: 'ENG', maxFH: 20000 },
  { name: 'Engine 2', ata: 72, kind: 'LRU', prefix: 'ENG', maxFH: 20000 },
  { name: 'APU', ata: 49, kind: 'LRU', prefix: 'APU', maxFH: 12000 },
  { name: 'Hydraulic Pump', ata: 29, kind: 'LRU', prefix: 'HYD', maxFH: 15000 },
  { name: 'Landing Gear Actuator', ata: 32, kind: 'LLP', prefix: 'LGA', maxFC: 30000 },
  { name: 'Fuel Pump', ata: 28, kind: 'LRU', prefix: 'FUL', maxFH: 18000 },
  { name: 'Bleed Air Valve', ata: 36, kind: 'LRU', prefix: 'BLD', maxFH: 16000 },
  { name: 'Generator', ata: 24, kind: 'LRU', prefix: 'GEN', maxFH: 14000 },
];

await mongoose.connect(process.env.MONGO_URI ?? 'mongodb://localhost:27017/aeroguard');

// The audit log is never wiped.
await mongoose.connection.dropCollection('users').catch(() => undefined); // also drops the old email-only indexes
await UserModel.syncIndexes();
await Promise.all([UserModel.deleteMany({}), AircraftModel.deleteMany({}), ComponentModel.deleteMany({})]);

const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
await UserModel.insertMany([
  { name: 'Admin', username: 'admin', role: 'ADMIN', passwordHash },
  { name: 'Planner', username: 'planner', role: 'PLANNER', passwordHash },
  { name: 'Auditor', username: 'auditor', role: 'AUDITOR', passwordHash },
  { name: 'Engineer B1', username: 'engineer.b1', role: 'ENGINEER', licenseCategory: 'B1', passwordHash },
  { name: 'Engineer B2', username: 'engineer.b2', role: 'ENGINEER', licenseCategory: 'B2', passwordHash },
]);

const rows = Array.from({ length: 50 }, (_, k) => {
  const n = k + 1;
  const hours = 8000 + ((n * 977) % 12000);
  return {
    registration: `VT-AG${String(n).padStart(2, '0')}`,
    type: n % 2 ? 'SIM-320' : 'SIM-737',
    msn: String(1000 + n),
    totalFlightHours: hours,
    totalFlightCycles: Math.round(hours / 1.8),
    status: 'SERVICEABLE',
    baseStation: STATIONS[n % STATIONS.length],
    averageDailyUtilisation: 6 + (n % 5),
  };
});
const aircraft = await AircraftModel.insertMany(rows);

for (const [i, ac] of aircraft.entries()) {
  const hours = rows[i].totalFlightHours;
  const docs = TEMPLATES.map((t, idx) => ({
    aircraftId: ac._id,
    partNumber: `${t.prefix}-${100 + idx}`,
    serialNumber: `SN-${rows[i].registration}-${idx + 1}`,
    name: t.name,
    ataChapter: t.ata,
    kind: t.kind,
    hoursSinceNew: Math.round(hours * (0.3 + ((i + idx) % 7) * 0.1)),
    cyclesSinceNew: Math.round((hours * (0.3 + ((i + idx) % 7) * 0.1)) / 1.8),
    limits: { maxFH: t.maxFH, maxFC: t.maxFC },
    installedAt: new Date('2020-01-01'),
  }));
  await ComponentModel.insertMany(docs);
}

console.log(`Seeded 5 users, ${aircraft.length} aircraft, ${aircraft.length * TEMPLATES.length} components.`);
console.log(`Demo logins (password ${DEMO_PASSWORD}): admin, planner, auditor, engineer.b1, engineer.b2`);
await mongoose.disconnect();