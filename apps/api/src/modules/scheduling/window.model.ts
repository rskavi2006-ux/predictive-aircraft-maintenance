import { Schema, model } from 'mongoose';
import { LICENSE_CATEGORIES } from '@aeroguard/shared';
import { WINDOW_STATUSES } from '../../common/stateMachines.js';

export const WINDOW_TYPES = ['LINE', 'BASE', 'AOG'] as const;

const windowSchema = new Schema(
  {
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', required: true },
    registration: String,
    type: { type: String, enum: [...WINDOW_TYPES], required: true },
    station: { type: String, required: true },
    start: { type: Date, required: true },
    end: { type: Date, required: true },
    capacityHours: { type: Number, required: true },
    bookedHours: { type: Number, default: 0 },
    licences: { type: [{ type: String, enum: [...LICENSE_CATEGORIES] }], default: () => [...LICENSE_CATEGORIES] },
    status: { type: String, enum: [...WINDOW_STATUSES], default: 'PLANNED' },
    createdBy: String,
  },
  { timestamps: true },
);
windowSchema.index({ aircraftId: 1, start: 1 }); // windows of one aircraft in time order
windowSchema.index({ status: 1, start: 1 }); // scheduler reads upcoming planned windows

export const WindowModel = model('MaintenanceWindow', windowSchema);