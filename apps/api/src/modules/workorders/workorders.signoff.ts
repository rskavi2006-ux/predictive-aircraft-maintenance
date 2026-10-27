import type { LicenseCategory } from '@aeroguard/shared';
import { assertTransition, workOrderMachine, type WorkOrderStatus } from '../../common/stateMachines.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import { markServiced } from '../components/components.service.js';
import { markComplied } from '../compliance/compliance.service.js';
import { setWindowStatus } from '../scheduling/scheduling.service.js';
import { tasksByIds, transitionTasks } from '../tasks/tasks.execution.js';
import type { AuditCtx } from '../tasks/tasks.service.js';
import { WorkOrderModel } from './workorder.model.js';
import { getWorkOrder } from './workorders.service.js';

export async function startWorkOrder(id: string, ctx: AuditCtx) {
  const wo = await getWorkOrder(id);
  assertTransition(workOrderMachine, 'Work order', wo.status as WorkOrderStatus, 'IN_PROGRESS');
  const claimed = await WorkOrderModel.findOneAndUpdate(
    { _id: wo._id, status: 'OPEN' },
    { $set: { status: 'IN_PROGRESS' } },
    { new: true },
  );
  if (!claimed) throw new AppError(409, 'CONFLICT', 'Work order was changed by someone else, reload and retry');
  await transitionTasks(wo.taskIds.map(String), 'IN_PROGRESS', 'task.start', ctx);
  await setWindowStatus(String(wo.windowId), 'ACTIVE', ctx);
  await record({
    ...ctx,
    action: 'workorder.start',
    entityType: 'WorkOrder',
    entityId: id,
    before: { status: 'OPEN' },
    after: { status: 'IN_PROGRESS' },
  });
  return claimed;
}

export async function addFinding(id: string, text: string, ctx: AuditCtx) {
  const updated = await WorkOrderModel.findOneAndUpdate(
    { _id: id, status: 'IN_PROGRESS' },
    { $push: { findings: { text, by: ctx.actorId, at: new Date() } } },
    { new: true },
  );
  if (!updated) {
    await getWorkOrder(id); // 404 when it does not exist
    throw new AppError(409, 'INVALID_STATE', 'Findings can only be added while the work order is in progress');
  }
  await record({ ...ctx, action: 'workorder.finding', entityType: 'WorkOrder', entityId: id, after: { text } });
  return updated;
}

export async function signOffWorkOrder(
  id: string,
  engineer: { id: string; licenseCategory?: LicenseCategory },
  remarks: string | undefined,
  ctx: AuditCtx,
) {
  const wo = await getWorkOrder(id);
  assertTransition(workOrderMachine, 'Work order', wo.status as WorkOrderStatus, 'COMPLETED');

  // Only an engineer whose licence category matches every task may certify the release (CRS).
  const taskIds = wo.taskIds.map(String);
  const tasks = await tasksByIds(taskIds);
  const required = [...new Set(tasks.map((t) => t.requiredLicense))];
  const lic = engineer.licenseCategory;
  if (!lic || tasks.some((t) => t.requiredLicense !== lic)) {
    throw new AppError(403, 'LICENCE_MISMATCH', `Sign-off needs a ${required.join(' and ')} licence`, {
      required,
      yours: lic ?? null,
    });
  }

  // Claim the sign-off atomically so it cannot happen twice.
  const claimed = await WorkOrderModel.findOneAndUpdate(
    { _id: wo._id, status: 'IN_PROGRESS' },
    { $set: { status: 'COMPLETED', signedOffBy: engineer.id, signedOffAt: new Date() } },
    { new: true },
  );
  if (!claimed) throw new AppError(409, 'CONFLICT', 'Work order was changed by someone else, reload and retry');

  try {
    await transitionTasks(taskIds, 'DONE', 'task.complete', ctx);
    await markServiced(tasks.flatMap((t) => (t.componentId ? [t.componentId] : [])));
    await markComplied(tasks, String(wo._id), ctx);
    const stillOpen = await WorkOrderModel.countDocuments({ windowId: wo.windowId, status: { $ne: 'COMPLETED' } });
    if (stillOpen === 0) await setWindowStatus(String(wo.windowId), 'COMPLETED', ctx);
  } catch (err) {
    // No multi-document transactions without a replica set, so undo the claim by hand.
    await WorkOrderModel.updateOne(
      { _id: wo._id },
      { $set: { status: 'IN_PROGRESS' }, $unset: { signedOffBy: '', signedOffAt: '' } },
    );
    throw err;
  }

  await record({
    ...ctx,
    action: 'workorder.signoff',
    entityType: 'WorkOrder',
    entityId: id,
    before: { status: 'IN_PROGRESS' },
    after: { status: 'COMPLETED', signedOffBy: engineer.id, licence: lic, tasksCompleted: taskIds.length, remarks },
  });
  return claimed;
}