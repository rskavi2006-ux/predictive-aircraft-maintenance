import { record } from '../audit/audit.service.js';
import type { AuditCtx } from '../tasks/tasks.service.js';
import { ComplianceModel } from './compliance.model.js';

export interface ComplianceInput {
  id: string;
  aircraftId: string;
  componentId: string | null;
  title: string;
  sourceType: string;
  dueDate: Date;
}

// Alert and programme work are tracked as PROGRAMME items. TODO: verify the mapping.
export function kindFor(sourceType: string): 'AD' | 'MEL' | 'PROGRAMME' {
  if (sourceType === 'AD') return 'AD';
  if (sourceType === 'MEL') return 'MEL';
  return 'PROGRAMME';
}

// Called at sign-off: the work order is the evidence that the item was complied with.
export async function markComplied(tasks: ComplianceInput[], workOrderId: string, ctx: AuditCtx) {
  for (const t of tasks) {
    await ComplianceModel.updateOne(
      { taskId: t.id },
      {
        $set: { status: 'COMPLIED', evidenceWorkOrderId: workOrderId, compliedAt: new Date() },
        $setOnInsert: {
          aircraftId: t.aircraftId,
          componentId: t.componentId,
          kind: kindFor(t.sourceType),
          reference: `${t.sourceType}-${t.id.slice(-6).toUpperCase()}`,
          title: t.title,
          dueDate: t.dueDate,
        },
      },
      { upsert: true },
    );
    await record({
      ...ctx,
      action: 'compliance.complied',
      entityType: 'ComplianceRecord',
      entityId: t.id,
      after: { workOrderId, kind: kindFor(t.sourceType) },
    });
  }
}