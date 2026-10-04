import type { Response } from 'express';
import { envelope } from '../../common/pagination.js';
import { AuditModel } from './audit.model.js';

export interface AuditEntry {
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
}

// Who is acting and which request, taken from the authenticated response context.
export function actorFrom(res: Response) {
  const user = res.locals.user as { id: string; role: string } | undefined;
  return {
    actorId: user?.id,
    actorRole: user?.role,
    requestId: res.locals.requestId as string | undefined,
  };
}

export async function record(entry: AuditEntry): Promise<void> {
  await AuditModel.create({ ...entry, before: entry.before ?? null, after: entry.after ?? null });
}

export async function listAudit(
  q: { page: number; limit: number; entityType?: string; entityId?: string; action?: string; actorId?: string },
) {
  const filter: Record<string, unknown> = {};
  if (q.entityType) filter.entityType = q.entityType;
  if (q.entityId) filter.entityId = q.entityId;
  if (q.action) filter.action = q.action;
  if (q.actorId) filter.actorId = q.actorId;
  const [data, total] = await Promise.all([
    AuditModel.find(filter)
      .sort({ timestamp: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    AuditModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}