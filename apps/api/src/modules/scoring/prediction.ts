import { METRICS, type MetricName, type Reading } from '../../common/metrics.js';

export interface ContributingFactor {
  metric: MetricName;
  value: number;
  nominal: number;
  critical: number;
  unit: string;
  stress: number;
  slopePerDay: number;
  note: string;
}

export interface Prediction {
  healthScore: number;
  failureProbability: number;
  rulDays: number | null;
  confidence: number;
  contributingFactors: ContributingFactor[];
}

// The seam (ADR 0009): any predictor, rule-based or ML, implements this.
export interface PredictionService {
  predict(readings: Reading[]): Prediction;
}

// Simulated, fictional limits. TODO: verify against real engineering data before any real use.
const LIMITS: Record<MetricName, { label: string; nominal: number; critical: number; unit: string }> = {
  egt: { label: 'EGT', nominal: 600, critical: 720, unit: 'deg C' },
  vibration: { label: 'Vibration', nominal: 2, critical: 6, unit: 'mm/s' },
  oilPressure: { label: 'Oil pressure', nominal: 50, critical: 25, unit: 'psi' },
  oilTemp: { label: 'Oil temperature', nominal: 90, critical: 130, unit: 'deg C' },
};

const HOUR_MS = 3_600_000;
const TREND_WINDOW = 24; // readings used for the linear trend
const MIN_TREND_POINTS = 6;
const MIN_STRESS_RATE_PER_DAY = 0.03; // ignore trends weaker than 3% of the range per day (noise)

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r2 = (x: number) => Math.round(x * 100) / 100;

function series(readings: Reading[], metric: MetricName) {
  return readings.flatMap((r) => {
    const v = r[metric];
    return typeof v === 'number' ? [{ t: r.timestamp.getTime(), v }] : [];
  });
}

// Least-squares slope in units per hour.
function slopePerHour(points: { t: number; v: number }[]): number {
  const n = points.length;
  if (n < MIN_TREND_POINTS) return 0;
  const t0 = points[0].t;
  const xs = points.map((p) => (p.t - t0) / HOUR_MS);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = points.reduce((a, p) => a + p.v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (points[i].v - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

// v1: thresholds + linear trend. Heuristic, not calibrated, runs on simulated data only.
export class RuleBasedPredictionService implements PredictionService {
  predict(readings: Reading[]): Prediction {
    const sorted = [...readings].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const factors: ContributingFactor[] = [];
    let minHealth = 100;
    let worstStress = 0;
    let rul: number | null = null;

    for (const metric of METRICS) {
      const pts = series(sorted, metric);
      if (pts.length === 0) continue;
      const cfg = LIMITS[metric];
      const range = cfg.critical - cfg.nominal; // negative for "low is bad" metrics
      const recent = pts.slice(-3);
      const value = recent.reduce((a, p) => a + p.v, 0) / recent.length;
      const stress = clamp((value - cfg.nominal) / range, 0, 1); // 0 = nominal, 1 = at limit
      const slopeDay = slopePerHour(pts.slice(-TREND_WINDOW)) * 24;
      const stressRate = slopeDay / range; // per day; positive = getting worse

      minHealth = Math.min(minHealth, 100 * (1 - stress));
      worstStress = Math.max(worstStress, stress);

      let daysToCritical: number | null = null;
      if (stress >= 1) daysToCritical = 0;
      else if (stressRate > MIN_STRESS_RATE_PER_DAY) daysToCritical = (1 - stress) / stressRate;
      if (daysToCritical !== null) rul = rul === null ? daysToCritical : Math.min(rul, daysToCritical);

      if (stress >= 0.25 || (daysToCritical !== null && daysToCritical < 30)) {
        const trend =
          stressRate > MIN_STRESS_RATE_PER_DAY
            ? ', trending toward the limit (' + (slopeDay > 0 ? '+' : '') + slopeDay.toFixed(2) + ' ' + cfg.unit + '/day)'
            : '';
        factors.push({
          metric,
          value: r2(value),
          nominal: cfg.nominal,
          critical: cfg.critical,
          unit: cfg.unit,
          stress: r2(stress),
          slopePerDay: r2(slopeDay),
          note: `${cfg.label} ${value.toFixed(1)} ${cfg.unit} (nominal ${cfg.nominal}, limit ${cfg.critical})${trend}`,
        });
      }
    }

    factors.sort((a, b) => b.stress - a.stress);
    const rulDays = rul === null || rul > 365 ? null : Math.round(rul * 10) / 10;
    let p = worstStress ** 2;
    if (rulDays !== null && rulDays < 30) p += ((30 - rulDays) / 30) * 0.4;

    return {
      healthScore: Math.round(minHealth),
      failureProbability: r2(clamp(p, 0, 0.99)),
      rulDays,
      confidence: r2(clamp(sorted.length / 24, 0, 1)), // grows with the amount of data
      contributingFactors: factors,
    };
  }
}