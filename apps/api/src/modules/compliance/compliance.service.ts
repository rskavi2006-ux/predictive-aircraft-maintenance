import { Types } from 'mongoose';
import { envelope } from '../../common/pagination.js';
import { record } from '../audit/audit.service.js';
import { activeTasks } from '../tasks/tasks.execution.js';
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

// Every active task gets an OPEN record. Existing records (including COMPLIED ones) are never touched.
export async function syncRecords(): Promise<number> {
  const tasks = await activeTasks();
  if (tasks.length === 0) return 0;
  const res = await ComplianceModel.bulkWrite(
    tasks.map((t) => ({
      updateOne: {
        filter: { taskId: new Types.ObjectId(t.id) },
        update: {
          $setOnInsert: {
            aircraftId: new Types.ObjectId(t.aircraftId),
            componentId: t.componentId ? new Types.ObjectId(t.componentId) : null,
            kind: kindFor(t.sourceType),
            reference: `${t.sourceType}-${t.id.slice(-6).toUpperCase()}`,
            title: t.title,
            dueDate: t.dueDate,
            status: 'OPEN',
          },
        },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return res.upsertedCount;
}

export async function markOverdue(now: Date, ctx: AuditCtx): Promise<number> {
  const late = await ComplianceModel.find({ status: 'OPEN', dueDate: { $lt: now } }, { _id: 1 }).lean();
  if (late.length === 0) return 0;
  await ComplianceModel.updateMany({ _id: { $in: late.map((d) => d._id) }, status: 'OPEN' }, { $set: { status: 'OVERDUE' } });
  for (const d of late) {
    await record({
      ...ctx,
      action: 'compliance.overdue',
      entityType: 'ComplianceRecord',
      entityId: String(d._id),
      before: { status: 'OPEN' },
      after: { status: 'OVERDUE' },
    });
  }
  return late.length;
}

export async function dueSoonItems(now: Date, soonDays: number) {
  const until = new Date(now.getTime() + soonDays * 86_400_000);
  const docs = await ComplianceModel.find({ status: 'OPEN', dueDate: { $gte: now, $lte: until } })
    .sort({ dueDate: 1 })
    .lean();
  return docs.map((d) => ({
    id: String(d._id),
    aircraftId: String(d.aircraftId),
    reference: d.reference,
    title: d.title ?? d.reference,
    dueDate: d.dueDate,
  }));
}

export interface CheckOptions {
  now?: Date;
  dueSoonDays?: number;
  ctx?: AuditCtx;
}

// The daily check: create missing records, mark overdue items, list items that are due soon.
export async function runComplianceCheck(opts: CheckOptions = {}) {
  const now = opts.now ?? new Date();
  const soonDays = opts.dueSoonDays ?? 7;
  const ctx = opts.ctx ?? { actorRole: 'SYSTEM' };
  const created = await syncRecords();
  const markedOverdue = await markOverdue(now, ctx);
  const dueSoon = await dueSoonItems(now, soonDays);
  await record({
    ...ctx,
    action: 'compliance.check',
    entityType: 'System',
    entityId: 'compliance-check',
    after: { created, markedOverdue, dueSoon: dueSoon.length, dueSoonDays: soonDays },
  });
  return { checkedAt: now, dueSoonDays: soonDays, created, markedOverdue, dueSoon };
}

export async function listCompliance(q: {
  page: number;
  limit: number;
  status?: string;
  kind?: string;
  aircraftId?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.kind) filter.kind = q.kind;
  if (q.aircraftId) filter.aircraftId = q.aircraftId;
  const [data, total] = await Promise.all([
    ComplianceModel.find(filter)
      .sort({ dueDate: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    ComplianceModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}

export async function complianceSummary(soonDays = 7, now = new Date()) {
  const until = new Date(now.getTime() + soonDays * 86_400_000);
  const [open, complied, overdue, dueSoon] = await Promise.all([
    ComplianceModel.countDocuments({ status: 'OPEN' }),
    ComplianceModel.countDocuments({ status: 'COMPLIED' }),
    ComplianceModel.countDocuments({ status: 'OVERDUE' }),
    ComplianceModel.countDocuments({ status: 'OPEN', dueDate: { $gte: now, $lte: until } }),
  ]);
  return { open, complied, overdue, dueSoon, dueSoonDays: soonDays, items: await dueSoonItems(now, soonDays) };
}