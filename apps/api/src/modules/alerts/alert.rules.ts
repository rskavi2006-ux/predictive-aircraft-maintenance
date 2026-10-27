import type { Priority } from '../../common/priority.js';
import type { Prediction } from '../scoring/prediction.js';
import { AT_RISK_THRESHOLD } from '../scoring/scoring.service.js';

// Fires on low health, high failure probability, or a short remaining life.
export function shouldAlert(p: Prediction): boolean {
  return (
    p.healthScore < AT_RISK_THRESHOLD ||
    p.failureProbability >= 0.5 ||
    (p.rulDays !== null && p.rulDays < 14)
  );
}

// The cause is the metric contributing most; used for de-duplication.
export function causeFor(p: Prediction): string {
  return p.contributingFactors[0]?.metric ?? 'general';
}

export function priorityFor(p: Prediction): Priority {
  const rul = p.rulDays;
  if (p.healthScore < 25 || (rul !== null && rul <= 2)) return 'AOG_RISK';
  if (p.healthScore < 50 || (rul !== null && rul < 7)) return 'HIGH';
  if (p.healthScore < AT_RISK_THRESHOLD || (rul !== null && rul < 14)) return 'MEDIUM';
  return 'LOW';
}