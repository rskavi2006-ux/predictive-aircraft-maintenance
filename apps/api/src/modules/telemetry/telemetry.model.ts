import { Schema, model } from 'mongoose';

const readingSchema = new Schema(
  {
    componentId: { type: Schema.Types.ObjectId, ref: 'Component', required: true },
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', default: null },
    timestamp: { type: Date, required: true },
    egt: Number,
    vibration: Number,
    oilPressure: Number,
    oilTemp: Number,
  },
  { versionKey: false },
);
// Idempotent ingest: one reading per component per timestamp. Also serves chart queries.
readingSchema.index({ componentId: 1, timestamp: 1 }, { unique: true });

export const ReadingModel = model('Reading', readingSchema);