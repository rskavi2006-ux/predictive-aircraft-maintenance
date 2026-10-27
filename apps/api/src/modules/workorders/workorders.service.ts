import { Types } from 'mongoose';
import { envelope } from '../../common/pagination.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import type { AuditCtx } from '../tasks/tasks.service.js';
import { WorkOrderModel } from './workorder.model.js';

export async function createWorkOrder(
  input: { aircraftId: string; registration: string; windowId: string; taskIds: string[] },
  ctx: AuditCtx,
) {
  const _id = new Types.ObjectId();
  const workOrder = await WorkOrderModel.create({
    _id,
    number: `WO-${String(_id).slice(-6).toUpperCase()}`,
    aircraftId: new Types.ObjectId(input.aircraftId),
    registration: input.registration,
    windowId: new Types.ObjectId(input.windowId),
    taskIds: input.taskIds.map((id) => new Types.ObjectId(id)),
  });
  await record({
    ...ctx,
    action: 'workorder.create',
    entityType: 'WorkOrder',
    entityId: String(workOrder._id),
    after: workOrder.toObject(),
  });
  return workOrder;
}

export async function listWorkOrders(q: { page: number; limit: number; status?: string; aircraftId?: string }) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.aircraftId) filter.aircraftId = q.aircraftId;
  const [data, total] = await Promise.all([
    WorkOrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    WorkOrderModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}

export async function getWorkOrder(id: string) {
  const workOrder = await WorkOrderModel.findById(id);
  if (!workOrder) throw new AppError(404, 'NOT_FOUND', 'Work order not found');
  return workOrder;
}