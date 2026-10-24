import { assertTransition, taskMachine, type TaskStatus } from '../../common/stateMachines.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import { TaskModel } from './task.model.js';
import type { AuditCtx } from './tasks.service.js';

export interface TaskBrief {
  id: string;
  aircraftId: string;
  componentId: string | null;
  title: string;
  sourceType: string;
  requiredLicense: 'B1' | 'B2';
  dueDate: Date;
  status: TaskStatus;
}

export async function tasksByIds(ids: string[]): Promise<TaskBrief[]> {
  const docs = await TaskModel.find({ _id: { $in: ids } }).lean();
  return docs.map((d) => ({
    id: String(d._id),
    aircraftId: String(d.aircraftId),
    componentId: d.componentId ? String(d.componentId) : null,
    title: d.title,
    sourceType: d.sourceType,
    requiredLicense: d.requiredLicense as 'B1' | 'B2',
    dueDate: d.estimatedDueDate,
    status: d.status as TaskStatus,
  }));
}

// Moves tasks through the task state machine (rule 13), one conditional update each.
export async function transitionTasks(ids: string[], to: TaskStatus, action: string, ctx: AuditCtx) {
  const tasks = await TaskModel.find({ _id: { $in: ids } });
  if (tasks.length !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Some tasks no longer exist');
  for (const t of tasks) assertTransition(taskMachine, 'Task', t.status as TaskStatus, to);
  for (const t of tasks) {
    const before = t.status;
    const res = await TaskModel.updateOne({ _id: t._id, status: before }, { $set: { status: to } });
    if (res.modifiedCount !== 1) throw new AppError(409, 'CONFLICT', 'A task changed while updating, reload and retry');
    await record({
      ...ctx,
      action,
      entityType: 'Task',
      entityId: String(t._id),
      before: { status: before },
      after: { status: to },
    });
  }
}