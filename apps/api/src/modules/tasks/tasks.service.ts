import { Types } from 'mongoose';
import type { LicenseCategory } from '@aeroguard/shared';
import { envelope } from '../../common/pagination.js';
import type { Priority } from '../../common/priority.js';
import type { TaskStatus } from '../../common/stateMachines.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import { getComponent } from '../components/components.service.js';
import { getAircraft } from '../fleet/fleet.service.js';
import { TaskModel } from './task.model.js';
import { durationFor, estimateDueDate, requiredLicenseFor, type DueLimit } from './tasks.rules.js';

export interface AuditCtx {
  actorId?: string;
  actorRole?: string;
  requestId?: string;
}

const ACTIVE_STATUSES: TaskStatus[] = ['PENDING', 'SCHEDULED', 'IN_PROGRESS'];

export async function hasActiveTaskForComponent(componentId: string): Promise<boolean> {
  return (await TaskModel.exists({ componentId, status: { $in: ACTIVE_STATUSES } })) !== null;
}

export interface AlertTaskInput {
  alertId: string;
  aircraftId: string;
  registration: string;
  componentId: string;
  componentName: string;
  ataChapter: number;
  kind: string;
  rulDays: number | null;
  priority: Priority;
}

// Called when an engineer approves an alert. Due date comes from remaining life (default 14 days).
export async function createFromAlert(input: AlertTaskInput, ctx: AuditCtx) {
  const days = Math.max(input.rulDays ?? 14, 1);
  const dueDate = new Date(Date.now() + days * 86_400_000);
  const task = await TaskModel.create({
    aircraftId: new Types.ObjectId(input.aircraftId),
    componentId: new Types.ObjectId(input.componentId),
    componentName: input.componentName,
    sourceAlertId: new Types.ObjectId(input.alertId),
    sourceType: 'ALERT',
    title: `Inspect and rectify ${input.componentName} (${input.registration})`,
    ataChapter: input.ataChapter,
    requiredLicense: requiredLicenseFor(input.ataChapter),
    estimatedDurationHours: durationFor(input.kind),
    dueLimit: { date: dueDate },
    estimatedDueDate: dueDate,
    priority: input.priority,
  });
  await record({
    ...ctx,
    action: 'task.create',
    entityType: 'Task',
    entityId: String(task._id),
    after: task.toObject(),
  });
  return task;
}

export interface ManualTaskInput {
  aircraftId: string;
  componentId?: string;
  sourceType: 'PROGRAMME' | 'AD' | 'MEL';
  title: string;
  ataChapter: number;
  requiredLicense: LicenseCategory;
  estimatedDurationHours: number;
  dueLimit: DueLimit;
  priority: Priority;
}

export async function createTask(input: ManualTaskInput, ctx: AuditCtx) {
  const aircraft = await getAircraft(input.aircraftId);
  let componentName: string | undefined;
  if (input.componentId) {
    const component = await getComponent(input.componentId);
    if (String(component.aircraftId) !== input.aircraftId) {
      throw new AppError(422, 'COMPONENT_MISMATCH', 'Component is not installed on this aircraft');
    }
    componentName = component.name;
  }
  // 1.8 flight hours per cycle is only a fallback when the aircraft has no cycles recorded (assumption).
  const hoursPerCycle = aircraft.totalFlightCycles > 0 ? aircraft.totalFlightHours / aircraft.totalFlightCycles : 1.8;
  const due = estimateDueDate(input.dueLimit, {
    now: new Date(),
    utilisationHoursPerDay: aircraft.averageDailyUtilisation,
    hoursPerCycle,
  });
  if (!due) throw new AppError(400, 'VALIDATION_ERROR', 'A due limit (date, fh or fc) is required');

  const task = await TaskModel.create({
    aircraftId: new Types.ObjectId(input.aircraftId),
    componentId: input.componentId ? new Types.ObjectId(input.componentId) : null,
    componentName,
    sourceType: input.sourceType,
    title: input.title,
    ataChapter: input.ataChapter,
    requiredLicense: input.requiredLicense,
    estimatedDurationHours: input.estimatedDurationHours,
    dueLimit: input.dueLimit,
    estimatedDueDate: due,
    priority: input.priority,
  });
  await record({
    ...ctx,
    action: 'task.create',
    entityType: 'Task',
    entityId: String(task._id),
    after: task.toObject(),
  });
  return task;
}

export async function listTasks(q: {
  page: number;
  limit: number;
  status?: string;
  aircraftId?: string;
  priority?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.aircraftId) filter.aircraftId = q.aircraftId;
  if (q.priority) filter.priority = q.priority;
  const [data, total] = await Promise.all([
    TaskModel.find(filter)
      .sort({ estimatedDueDate: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    TaskModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}

export async function getTask(id: string) {
  const task = await TaskModel.findById(id);
  if (!task) throw new AppError(404, 'NOT_FOUND', 'Task not found');
  return task;
}