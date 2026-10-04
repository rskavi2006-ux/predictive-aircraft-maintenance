import { Types } from 'mongoose';
import { downsample } from '../../common/downsample.js';
import { METRICS, type Reading } from '../../common/metrics.js';
import { AppError } from '../../middleware/errorHandler.js';
import { componentRefs, listAllRefs } from '../components/components.service.js';
import { listAircraft } from '../fleet/fleet.service.js';
import { scoreComponent } from '../scoring/scoring.service.js';
import type { ReadingInput } from './telemetry.schema.js';
import { ReadingModel } from './telemetry.model.js';

interface StoredReading {
  timestamp: Date;
  egt?: number | null;
  vibration?: number | null;
  oilPressure?: number | null;
  oilTemp?: number | null;
}

const toReading = (r: StoredReading): Reading => ({
  timestamp: r.timestamp,
  egt: r.egt,
  vibration: r.vibration,
  oilPressure: r.oilPressure,
  oilTemp: r.oilTemp,
});

async function recentReadings(componentId: string, n: number): Promise<Reading[]> {
  const rows = await ReadingModel.find({ componentId: new Types.ObjectId(componentId) })
    .sort({ timestamp: -1 })
    .limit(n)
    .lean();
  return rows.reverse().map(toReading);
}

// Idempotent: a reading that already exists for (componentId, timestamp) is skipped.
// v1 scores the affected components right after insert (a worker job comes later, see ADR 0010).
export async function ingestBatch(readings: ReadingInput[]) {
  const ids = [...new Set(readings.map((r) => r.componentId))];
  const refs = await componentRefs(ids);
  const known = new Map(refs.map((r) => [r.id, r] as const));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length > 0) {
    throw new AppError(422, 'UNKNOWN_COMPONENT', 'Batch references unknown components', { unknown });
  }

  const ops = readings.flatMap((r) => {
    const ref = known.get(r.componentId);
    if (!ref) return [];
    const componentId = new Types.ObjectId(r.componentId);
    const doc: Record<string, unknown> = {
      componentId,
      aircraftId: ref.aircraftId ? new Types.ObjectId(ref.aircraftId) : null,
      timestamp: r.timestamp,
    };
    for (const m of METRICS) {
      const v = r[m];
      if (v !== undefined) doc[m] = v;
    }
    return [
      {
        updateOne: {
          filter: { componentId, timestamp: r.timestamp },
          update: { $setOnInsert: doc },
          upsert: true,
        },
      },
    ];
  });

  const result = await ReadingModel.bulkWrite(ops, { ordered: false });
  const inserted = result.upsertedCount;

  for (const id of ids) {
    await scoreComponent(id, known.get(id)?.aircraftId ?? null, await recentReadings(id, 30));
  }

  return {
    received: readings.length,
    inserted,
    duplicates: readings.length - inserted,
    componentsScored: ids.length,
  };
}

export async function queryReadings(q: { componentId: string; from?: Date; to?: Date; maxPoints: number }) {
  const filter: Record<string, unknown> = { componentId: new Types.ObjectId(q.componentId) };
  if (q.from || q.to) {
    filter.timestamp = { ...(q.from && { $gte: q.from }), ...(q.to && { $lte: q.to }) };
  }
  const rows = await ReadingModel.find(filter).sort({ timestamp: -1 }).limit(5000).lean();
  rows.reverse();
  const points = downsample(rows.map(toReading), q.maxPoints);
  return { componentId: q.componentId, count: points.length, points };
}

// What the simulator needs to know: which components exist and where they are installed.
export async function listTargets() {
  const [refs, aircraft] = await Promise.all([listAllRefs(), listAircraft({ page: 1, limit: 100 })]);
  const reg = new Map(aircraft.data.map((a) => [String(a._id), a.registration] as const));
  return refs.map((r) => ({
    componentId: r.id,
    aircraftId: r.aircraftId,
    registration: r.aircraftId ? (reg.get(r.aircraftId) ?? null) : null,
    name: r.name,
  }));
}