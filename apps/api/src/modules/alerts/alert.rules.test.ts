import { describe, expect, it } from 'vitest';
import type { Prediction } from '../scoring/prediction.js';
import { causeFor, priorityFor, shouldAlert } from './alert.rules.js';

const pred = (healthScore: number, failureProbability: number, rulDays: number | null): Prediction => ({
  healthScore,
  failureProbability,
  rulDays,
  confidence: 1,
  contributingFactors: [],
});

describe('shouldAlert', () => {
  it('does not alert on a healthy component', () => {
    expect(shouldAlert(pred(99, 0.02, null))).toBe(false);
    expect(shouldAlert(pred(90, 0.1, 40))).toBe(false);
  });

  it('alerts on low health, high probability or short remaining life', () => {
    expect(shouldAlert(pred(60, 0.1, null))).toBe(true);
    expect(shouldAlert(pred(90, 0.6, null))).toBe(true);
    expect(shouldAlert(pred(90, 0.1, 10))).toBe(true);
  });
});

describe('priorityFor', () => {
  it('maps health and remaining life to a priority', () => {
    expect(priorityFor(pred(20, 0.9, 5))).toBe('AOG_RISK');
    expect(priorityFor(pred(80, 0.2, 1.5))).toBe('AOG_RISK');
    expect(priorityFor(pred(45, 0.5, null))).toBe('HIGH');
    expect(priorityFor(pred(60, 0.3, null))).toBe('MEDIUM');
    expect(priorityFor(pred(90, 0.6, null))).toBe('LOW');
  });
});

describe('causeFor', () => {
  it('uses the top contributing metric, or general when there is none', () => {
    expect(causeFor(pred(60, 0.3, null))).toBe('general');
    const withFactor: Prediction = {
      ...pred(60, 0.3, null),
      contributingFactors: [
        { metric: 'egt', value: 1, nominal: 1, critical: 2, unit: 'c', stress: 0.5, slopePerDay: 0, note: 'x' },
      ],
    };
    expect(causeFor(withFactor)).toBe('egt');
  });
});