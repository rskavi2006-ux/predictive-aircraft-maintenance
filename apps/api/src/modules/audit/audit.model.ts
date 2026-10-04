import { Schema, model } from 'mongoose';

const auditSchema = new Schema(
  {
    actorId: String,
    actorRole: String,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    requestId: String,
    timestamp: { type: Date, default: Date.now, required: true },
  },
  { versionKey: false },
);
auditSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });
auditSchema.index({ timestamp: -1 });

// Append-only: any update or delete through Mongoose is rejected.
auditSchema.pre(/^(update|replace|delete|findOneAnd)/, function () {
  throw new Error('Audit log is append-only');
});

export const AuditModel = model('AuditLog', auditSchema);