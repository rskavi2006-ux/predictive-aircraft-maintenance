import type { LicenseCategory } from '@aeroguard/shared';

// Fictional mapping for the simulator. TODO: verify against real licensing rules before any real use.
const B2_ATA = new Set([22, 23, 24, 31, 34, 42, 44, 45, 46]);
export function requiredLicenseFor(ataChapter: number): LicenseCategory {
  return B2_ATA.has(ataChapter) ? 'B2' : 'B1';
}

// Placeholder durations in hours. TODO: verify.
export function durationFor(kind: string): number {
  return kind === 'LLP' ? 6 : 3;
}

export interface DueLimit {
  date?: Date;
  fh?: number; // flight hours remaining
  fc?: number; // flight cycles remaining
}

// Earliest calendar date implied by the limits, using the aircraft's average utilisation.
export function estimateDueDate(
  limit: DueLimit,
  opts: { now: Date; utilisationHoursPerDay: number; hoursPerCycle: number },
): Date | null {
  const dayMs = 86_400_000;
  const candidates: number[] = [];
  if (limit.date) candidates.push(limit.date.getTime());
  if (limit.fh !== undefined && opts.utilisationHoursPerDay > 0) {
    candidates.push(opts.now.getTime() + (limit.fh / opts.utilisationHoursPerDay) * dayMs);
  }
  if (limit.fc !== undefined && opts.utilisationHoursPerDay > 0 && opts.hoursPerCycle > 0) {
    candidates.push(
      opts.now.getTime() + ((limit.fc * opts.hoursPerCycle) / opts.utilisationHoursPerDay) * dayMs,
    );
  }
  return candidates.length === 0 ? null : new Date(Math.min(...candidates));
}