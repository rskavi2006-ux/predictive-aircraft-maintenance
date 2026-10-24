import { Schema, model } from 'mongoose';

export const COMPLIANCE_KINDS = ['AD', 'MEL', 'LLP', 'PROGRAMME'] as const;
export const COMPLIANCE_STATUSES = ['OPEN', 'COMPLIED', 'OVERDUE'] as const;

const complianceSchema = new Schema(
  {
    aircraftId: { type: Schema.Types.ObjectId, ref: 'Aircraft', required: true },
    componentId: { type: Schema.Types.ObjectId, ref: 'Component', default: null },
    taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
    kind: { type: String, enum: [...COMPLIANCE_KINDS], required: true },
    reference: { type: String, required: true },
    title: String,
    dueDate: { type: Date, required: true }, // estimated calendar date of the due limit
    status: { type: String, enum: [...COMPLIANCE_STATUSES], default: 'OPEN' },
    evidenceWorkOrderId: { type: Schema.Types.ObjectId, ref: 'WorkOrder' },
    compliedAt: Date,
  },
  { timestamps: true },
);
complianceSchema.index({ status: 1, dueDate: 1 }); // dashboard: due soon and overdue
complianceSchema.index({ aircraftId: 1, status: 1 });
complianceSchema.index({ taskId: 1 }, { unique: true, sparse: true }); // one record per task

export const ComplianceModel = model('ComplianceRecord', complianceSchema);