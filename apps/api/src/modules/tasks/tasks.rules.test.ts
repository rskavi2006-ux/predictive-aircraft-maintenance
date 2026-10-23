import { describe, expect, it } from 'vitest';
import { durationFor, estimateDueDate, requiredLicenseFor } from './tasks.rules.js';

const now = new Date('2026-01-01T00:00:00Z');
const opts = { now, utilisationHoursPerDay: 8, hoursPerCycle: 2 };

describe('requiredLicenseFor and durationFor', () => {
  it('maps ATA chapters to a licence category', () => {
    expect(requiredLicenseFor(29)).toBe('B1');
    expect(requiredLicenseFor(72)).toBe('B1');
    expect(requiredLicenseFor(24)).toBe('B2');
  });

  it('gives longer durations to life-limited parts', () => {
    expect(durationFor('LRU')).toBe(3);
    expect(durationFor('LLP')).toBe(6);
  });
});

describe('estimateDueDate', () => {
  it('uses a calendar date as is', () => {
    const date = new Date('2026-01-20T00:00:00Z');
    expect(estimateDueDate({ date }, opts)).toEqual(date);
  });

  it('converts flight hours using daily utilisation', () => {
    expect(estimateDueDate({ fh: 80 }, opts)).toEqual(new Date('2026-01-11T00:00:00Z'));
  });

  it('converts flight cycles using hours per cycle', () => {
    expect(estimateDueDate({ fc: 10 }, opts)).toEqual(new Date('2026-01-03T12:00:00Z'));
  });

  it('returns the earliest of several limits', () => {
    const date = new Date('2026-01-20T00:00:00Z');
    expect(estimateDueDate({ date, fh: 80 }, opts)).toEqual(new Date('2026-01-11T00:00:00Z'));
  });

  it('returns null when nothing can be estimated', () => {
    expect(estimateDueDate({}, opts)).toBeNull();
    expect(estimateDueDate({ fh: 10 }, { ...opts, utilisationHoursPerDay: 0 })).toBeNull();
  });
});