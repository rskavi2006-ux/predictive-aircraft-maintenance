import { Schema, model } from 'mongoose';

const componentSchema = new Schema(
  {
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', default: null },
    partNumber: { type: String, required: true },
    serialNumber: { type: String, required: true },
    name: { type: String, required: true },
    ataChapter: { type: Number, required: true },
    kind: { type: String, enum: ['LRU', 'LLP'], required: true },
    hoursSinceNew: { type: Number, default: 0 },
    cyclesSinceNew: { type: Number, default: 0 },
    limits: { maxFH: Number, maxFC: Number, maxCalendarDays: Number },
    installedAt: Date,
    status: { type: String, enum: ['INSTALLED', 'REMOVED'], default: 'INSTALLED' },
  },
  { timestamps: true },
);
componentSchema.index({ aircraftId: 1, ataChapter: 1 });
componentSchema.index({ partNumber: 1, serialNumber: 1 }, { unique: true });

export const ComponentModel = model('Component', componentSchema);