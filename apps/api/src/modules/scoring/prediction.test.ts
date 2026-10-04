import { describe, expect, it } from 'vitest';
import type { Measures, Reading } from '../../common/metrics.js';
import { RuleBasedPredictionService } from './prediction.js';

const predictor = new RuleBasedPredictionService();
const T0 = Date.UTC(2026, 0, 1);
const hourly = (n: number, f: (i: number) => Measures): Reading[] =>
  Array.from({ length: n }, (_, i) => ({ timestamp: new Date(T0 + i * 3_600_000), ...f(i) }));

describe('RuleBasedPredictionService', () => {
  it('handles no data', () => {
    const p = predictor.predict([]);
    expect(p.healthScore).toBe(100);
    expect(p.confidence).toBe(0);
    expect(p.rulDays).toBeNull();
    expect(p.contributingFactors).toEqual([]);
  });

  it('scores healthy, flat readings near 100 with no factors', () => {
    const p = predictor.predict(hourly(40, () => ({ vibration: 2, egt: 600, oilPressure: 50, oilTemp: 90 })));
    expect(p.healthScore).toBeGreaterThanOrEqual(98);
    expect(p.rulDays).toBeNull();
    expect(p.contributingFactors).toEqual([]);
    expect(p.failureProbability).toBeLessThan(0.05);
  });

  it('flags a rising vibration trend with a short remaining life', () => {
    const p = predictor.predict(hourly(40, (i) => ({ vibration: 2 + 0.06 * i })));
    expect(p.healthScore).toBeLessThan(70);
    expect(p.rulDays).not.toBeNull();
    expect(p.rulDays as number).toBeLessThan(5);
    expect(p.contributingFactors[0].metric).toBe('vibration');
    expect(p.failureProbability).toBeGreaterThan(0.3);
  });

  it('treats falling oil pressure as getting worse', () => {
    const p = predictor.predict(hourly(40, (i) => ({ oilPressure: 50 - 0.5 * i })));
    expect(p.healthScore).toBeLessThan(40);
    expect(p.contributingFactors.map((f) => f.metric)).toContain('oilPressure');
    expect(p.rulDays as number).toBeLessThan(3);
  });

  it('reports zero remaining life and high probability past the limit', () => {
    const p = predictor.predict(hourly(10, () => ({ vibration: 7 })));
    expect(p.healthScore).toBe(0);
    expect(p.rulDays).toBe(0);
    expect(p.failureProbability).toBeGreaterThan(0.9);
  });

  it('ignores metrics that are missing and has lower confidence with little data', () => {
    const p = predictor.predict(hourly(10, () => ({ egt: 600 })));
    expect(p.healthScore).toBe(100);
    expect(p.confidence).toBeLessThan(0.5);
  });
});