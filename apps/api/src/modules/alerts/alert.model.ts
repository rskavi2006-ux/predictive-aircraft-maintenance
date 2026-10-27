import { Schema, model } from 'mongoose';
import { PRIORITIES } from '../../common/priority.js';
import { ALERT_STATUSES } from '../../common/stateMachines.js';

const alertSchema = new Schema(
  {
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', required: true },
    registration: String,
    componentId: { type: Schema.Types.ObjectId, ref: 'Component', required: true },
    componentName: String,
    cause: { type: String, required: true }, // top contributing metric, for de-duplication
    // Explanation: why this alert fired.
    healthScore: Number,
    failureProbability: Number,
    rulDays: { type: Number, default: null },
    confidence: Number,
    contributingFactors: { type: Schema.Types.Mixed, default: [] },
    priority: { type: String, enum: [...PRIORITIES], required: true },
    priorityRank: Number,
    status: { type: String, enum: [...ALERT_STATUSES], default: 'OPEN' },
    active: { type: Boolean, default: true }, // true while OPEN or DEFERRED
    decidedBy: String,
    decidedAt: Date,
    decisionNote: String,
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
  },
  { timestamps: true },
);
// De-duplication guard: at most one active alert per component and cause (also safe under races).
alertSchema.index({ componentId: 1, cause: 1 }, { unique: true, partialFilterExpression: { active: true } });
alertSchema.index({ status: 1, priorityRank: 1, createdAt: -1 }); // alert queue
alertSchema.index({ aircraftId: 1, status: 1 });

export const AlertModel = model('Alert', alertSchema);