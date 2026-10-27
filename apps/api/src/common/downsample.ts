import { METRICS, type Reading } from './metrics.js';

// Averages readings into at most maxPoints buckets, for charts.
export function downsample(points: Reading[], maxPoints: number): Reading[] {
  if (points.length <= maxPoints) return points;
  const size = Math.ceil(points.length / maxPoints);
  const out: Reading[] = [];
  for (let i = 0; i < points.length; i += size) {
    const bucket = points.slice(i, i + size);
    const point: Reading = { timestamp: bucket[0].timestamp };
    for (const m of METRICS) {
      const vals = bucket.map((p) => p[m]).filter((v): v is number => typeof v === 'number');
      if (vals.length > 0) point[m] = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    out.push(point);
  }
  return out;
}