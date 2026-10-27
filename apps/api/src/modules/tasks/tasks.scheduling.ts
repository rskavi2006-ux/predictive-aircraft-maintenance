import type { Priority } from '../../common/priority.js';
import { assertTransition, taskMachine, type TaskStatus } from '../../common/stateMachines.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import { TaskModel } from './task.model.js';
import type { AuditCtx } from './tasks.service.js';

export interface PendingTask {
  id: string;
  aircraftId: string;
  title: string;
  priority: Priority;
  requiredLicense: 'B1' | 'B2';
  durationHours: number;
  dueDate: Date;
}

export async function listPendingTasks(): Promise<PendingTask[]> {
  const docs = await TaskModel.find({ status: 'PENDING' }).lean();
  return docs.map((d) => ({
    id: String(d._id),
    aircraftId: String(d.aircraftId),
    title: d.title,
    priority: d.priority as Priority,
    requiredLicense: d.requiredLicense as 'B1' | 'B2',
    durationHours: d.estimatedDurationHours,
    dueDate: d.estimatedDueDate,
  }));
}

// PENDING -> SCHEDULED for all tasks, or an error (state machine, rule 13).
export async function markScheduled(ids: string[], ctx: AuditCtx): Promise<void> {
  const tasks = await TaskModel.find({ _id: { $in: ids } });
  if (tasks.length !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Some tasks no longer exist');
  for (const t of tasks) assertTransition(taskMachine, 'Task', t.status as TaskStatus, 'SCHEDULED');
  const res = await TaskModel.updateMany({ _id: { $in: ids }, status: 'PENDING' }, { $set: { status: 'SCHEDULED' } });
  if (res.modifiedCount !== ids.length) {
    throw new AppError(409, 'CONFLICT', 'Tasks changed while scheduling, reload and retry');
  }
  for (const t of tasks) {
    await record({
      ...ctx,
      action: 'task.schedule',
      entityType: 'Task',
      entityId: String(t._id),
      before: { status: 'PENDING' },
      after: { status: 'SCHEDULED' },
    });
  }
}