import { Schema, model } from 'mongoose';

// Latest prediction per component (one document each).
const scoreSchema = new Schema(
  {
    componentId: { type: Schema.Types.ObjectId, ref: 'Component', required: true, unique: true },
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', default: null },
    healthScore: { type: Number, required: true },
    failureProbability: Number,
    rulDays: { type: Number, default: null },
    confidence: Number,
    contributingFactors: { type: Schema.Types.Mixed, default: [] },
    asOf: Date, // timestamp of the newest reading used
    computedAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
scoreSchema.index({ aircraftId: 1, healthScore: 1 }); // fleet and aircraft views, worst first

export const HealthScoreModel = model('HealthScore', scoreSchema);