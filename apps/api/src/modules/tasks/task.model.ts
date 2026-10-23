import { Schema, model } from 'mongoose';
import { LICENSE_CATEGORIES } from '@aeroguard/shared';
import { PRIORITIES } from '../../common/priority.js';
import { TASK_STATUSES } from '../../common/stateMachines.js';

export const TASK_SOURCES = ['ALERT', 'PROGRAMME', 'AD', 'MEL'] as const;

const taskSchema = new Schema(
  {
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', required: true },
    componentId: { type: Schema.Types.ObjectId, ref: 'Component', default: null },
    componentName: String,
    sourceAlertId: { type: Schema.Types.ObjectId, ref: 'Alert', default: null },
    sourceType: { type: String, enum: [...TASK_SOURCES], required: true },
    title: { type: String, required: true },
    ataChapter: { type: Number, required: true },
    requiredLicense: { type: String, enum: [...LICENSE_CATEGORIES], required: true },
    estimatedDurationHours: { type: Number, required: true },
    dueLimit: { date: Date, fh: Number, fc: Number },
    estimatedDueDate: { type: Date, required: true }, // what the scheduler sorts on
    priority: { type: String, enum: [...PRIORITIES], default: 'MEDIUM' },
    status: { type: String, enum: [...TASK_STATUSES], default: 'PENDING' },
  },
  { timestamps: true },
);
taskSchema.index({ status: 1, estimatedDueDate: 1 }); // scheduler: pending tasks, earliest due first
taskSchema.index({ aircraftId: 1, status: 1 }); // bundling per aircraft
taskSchema.index({ componentId: 1, status: 1 }); // "is there an open task for this component"

export const TaskModel = model('Task', taskSchema);