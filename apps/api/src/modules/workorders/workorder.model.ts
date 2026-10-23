import { Schema, model } from 'mongoose';
import { WORK_ORDER_STATUSES } from '../../common/stateMachines.js';

const workOrderSchema = new Schema(
  {
    number: { type: String, required: true, unique: true },
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', required: true },
    registration: String,
    windowId: { type: Schema.Types.ObjectId, ref: 'MaintenanceWindow', required: true },
    taskIds: [{ type: Schema.Types.ObjectId, ref: 'Task' }],
    status: { type: String, enum: [...WORK_ORDER_STATUSES], default: 'OPEN' },
    findings: { type: [{ text: String, by: String, at: Date }], default: [] },
    signedOffBy: String, // CRS sign-off (Step 6)
    signedOffAt: Date,
  },
  { timestamps: true },
);
workOrderSchema.index({ aircraftId: 1, status: 1 });
workOrderSchema.index({ windowId: 1 });
workOrderSchema.index({ status: 1, createdAt: -1 });

export const WorkOrderModel = model('WorkOrder', workOrderSchema);