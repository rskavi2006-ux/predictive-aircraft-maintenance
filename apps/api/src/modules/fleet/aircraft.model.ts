import { Schema, model } from 'mongoose';

export const AIRCRAFT_STATUSES = ['SERVICEABLE', 'IN_MAINTENANCE', 'AOG'] as const;

const aircraftSchema = new Schema(
  {
    registration: { type: String, required: true, unique: true, uppercase: true, trim: true },
    type: { type: String, required: true },
    msn: { type: String, required: true },
    totalFlightHours: { type: Number, default: 0 },
    totalFlightCycles: { type: Number, default: 0 },
    status: { type: String, enum: [...AIRCRAFT_STATUSES], default: 'SERVICEABLE' },
    baseStation: { type: String, required: true },
    averageDailyUtilisation: { type: Number, default: 8 }, // flight hours per day
  },
  { timestamps: true },
);
aircraftSchema.index({ status: 1 });

export const AircraftModel = model('Aircraft', aircraftSchema);