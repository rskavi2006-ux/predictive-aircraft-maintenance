import { Types } from 'mongoose';
import type { Reading } from '../../common/metrics.js';
import { AppError } from '../../middleware/errorHandler.js';
import { RuleBasedPredictionService, type PredictionService } from './prediction.js';
import { HealthScoreModel } from './scoring.model.js';

// Below this score a component counts as "at risk" (alerts use it in the next chunk).
export const AT_RISK_THRESHOLD = 70;

let predictor: PredictionService = new RuleBasedPredictionService();
// The seam: swap in an ML-backed predictor without touching other modules.
export function setPredictor(p: PredictionService) {
  predictor = p;
}

export async function scoreComponent(componentId: string, aircraftId: string | null, readings: Reading[]) {
  const prediction = predictor.predict(readings);
  const asOf =
    readings.length > 0 ? new Date(Math.max(...readings.map((r) => r.timestamp.getTime()))) : null;
  await HealthScoreModel.updateOne(
    { componentId: new Types.ObjectId(componentId) },
    {
      $set: {
        aircraftId: aircraftId ? new Types.ObjectId(aircraftId) : null,
        healthScore: prediction.healthScore,
        failureProbability: prediction.failureProbability,
        rulDays: prediction.rulDays,
        confidence: prediction.confidence,
        contributingFactors: prediction.contributingFactors,
        asOf,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );
  return prediction;
}

export async function fleetSummary() {
  return HealthScoreModel.aggregate<{
    _id: Types.ObjectId | null;
    minHealth: number;
    componentsScored: number;
    atRisk: number;
  }>([
    {
      $group: {
        _id: '$aircraftId',
        minHealth: { $min: '$healthScore' },
        componentsScored: { $sum: 1 },
        atRisk: { $sum: { $cond: [{ $lt: ['$healthScore', AT_RISK_THRESHOLD] }, 1, 0] } },
      },
    },
    { $sort: { minHealth: 1 } },
  ]);
}

export async function aircraftScores(aircraftId: string) {
  return HealthScoreModel.find({ aircraftId: new Types.ObjectId(aircraftId) })
    .sort({ healthScore: 1 })
    .lean();
}

export async function componentScore(componentId: string) {
  const score = await HealthScoreModel.findOne({ componentId: new Types.ObjectId(componentId) }).lean();
  if (!score) throw new AppError(404, 'NOT_FOUND', 'No health score for this component yet');
  return score;
}