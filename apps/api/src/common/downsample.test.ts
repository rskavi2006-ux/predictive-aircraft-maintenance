import { describe, expect, it } from 'vitest';
import { downsample } from './downsample.js';
import type { Reading } from './metrics.js';

const make = (n: number): Reading[] =>
  Array.from({ length: n }, (_, i) => ({ timestamp: new Date(2026, 0, 1, i), vibration: i + 1 }));

describe('downsample', () => {
  it('returns the input when it is already small enough', () => {
    const pts = make(5);
    expect(downsample(pts, 10)).toBe(pts);
  });

  it('averages buckets down to at most maxPoints', () => {
    const out = downsample(make(10), 5);
    expect(out).toHaveLength(5);
    expect(out[0].vibration).toBe(1.5);
    expect(out[4].vibration).toBe(9.5);
  });

  it('leaves out metrics that have no values', () => {
    const out = downsample(make(10), 5);
    expect(out[0].egt).toBeUndefined();
  });
});