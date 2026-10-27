import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../../.env', import.meta.url)));
} catch {
  // no .env file; rely on real environment variables
}

const API_URL = process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? '4000'}`;
const TOKEN = process.env.SERVICE_TOKEN ?? '';
if (!TOKEN) throw new Error('SERVICE_TOKEN is not set (see .env.example)');

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const next = i >= 0 ? process.argv[i + 1] : undefined;
  return next ?? fallback;
}

const aircraftCount = Number(arg('aircraft', '5'));
const hours = Number(arg('hours', '120'));
// registration:component name:scenario (drift = gradual degradation, spike = sudden jump)
const failSpec = arg('fail', 'VT-AG02:Engine 1:drift,VT-AG04:Hydraulic Pump:drift,VT-AG03:APU:spike');
if (!Number.isInteger(aircraftCount) || aircraftCount < 1) throw new Error('--aircraft must be a positive integer');
if (!Number.isInteger(hours) || hours < 10) throw new Error('--hours must be an integer of at least 10');

type Scenario = 'drift' | 'spike';
const scenarios = new Map<string, Scenario>();
for (const item of failSpec.split(',').filter(Boolean)) {
  const [registration, name, kind] = item.split(':');
  if (!registration || !name || (kind !== 'drift' && kind !== 'spike')) {
    throw new Error(`Bad --fail entry "${item}". Use registration:component name:drift|spike`);
  }
  scenarios.set(`${registration}|${name}`, kind);
}

interface Target {
  componentId: string;
  aircraftId: string | null;
  registration: string | null;
  name: string;
}

const noise = (amp: number) => (Math.random() * 2 - 1) * amp;
const round = (x: number) => Math.round(x * 100) / 100;

// Fictional telemetry. One reading = one simulated hour.
function makeReading(kind: Scenario | undefined, i: number, total: number) {
  let egt = 600 + noise(3);
  let vibration = 2 + noise(0.06);
  let oilPressure = 50 + noise(0.6);
  let oilTemp = 90 + noise(1);
  if (kind === 'drift') {
    vibration += 0.02 * i;
    egt += 0.5 * i;
    oilTemp += 0.08 * i;
    oilPressure -= 0.04 * i;
  }
  if (kind === 'spike' && i >= total - 8) {
    vibration += 3.2;
    egt += 50;
  }
  return { egt: round(egt), vibration: round(vibration), oilPressure: round(oilPressure), oilTemp: round(oilTemp) };
}

async function send(readings: object[]) {
  const res = await fetch(`${API_URL}/api/v1/telemetry/batch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-token': TOKEN },
    body: JSON.stringify({ readings }),
  });
  if (!res.ok) throw new Error(`Ingest failed: HTTP ${res.status} ${await res.text()}`);
  return (await res.json()) as { received: number; inserted: number; duplicates: number };
}

const targetsRes = await fetch(`${API_URL}/api/v1/telemetry/targets`, { headers: { 'x-service-token': TOKEN } });
if (!targetsRes.ok) throw new Error(`Could not load targets: HTTP ${targetsRes.status}. Is the API running?`);
const { targets } = (await targetsRes.json()) as { targets: Target[] };

const registrations = [...new Set(targets.map((t) => t.registration).filter((r): r is string => !!r))]
  .sort()
  .slice(0, aircraftCount);
const chosen = targets.filter((t) => t.registration && registrations.includes(t.registration));

console.log('AeroGuard simulator: all data is simulated (fictional aircraft).');
console.log(`Aircraft: ${registrations.join(', ')} | components: ${chosen.length} | hours: ${hours}`);
console.log(`Failure scenarios: ${[...scenarios].map(([k, v]) => `${k.replace('|', ' ')} (${v})`).join(', ') || 'none'}`);

// The last reading is "now" (rounded to the hour), so rerunning within the same hour sends duplicates.
const base = Math.floor(Date.now() / 3_600_000) * 3_600_000 - (hours - 1) * 3_600_000;
const BATCH_SIZE = 800;
let batch: object[] = [];
let received = 0;
let inserted = 0;
let duplicates = 0;

async function flush() {
  if (batch.length === 0) return;
  const r = await send(batch);
  received += r.received;
  inserted += r.inserted;
  duplicates += r.duplicates;
  console.log(`batch sent: inserted ${r.inserted}, duplicates ${r.duplicates}`);
  batch = [];
}

for (let i = 0; i < hours; i++) {
  for (const t of chosen) {
    const kind = scenarios.get(`${t.registration}|${t.name}`);
    batch.push({
      componentId: t.componentId,
      timestamp: new Date(base + i * 3_600_000).toISOString(),
      ...makeReading(kind, i, hours),
    });
    if (batch.length >= BATCH_SIZE) await flush();
  }
}
await flush();
console.log(`Done. received ${received}, inserted ${inserted}, duplicates ignored ${duplicates}.`);