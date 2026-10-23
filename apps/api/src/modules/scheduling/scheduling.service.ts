import { envelope } from '../../common/pagination.js';
import { assertTransition, windowMachine, type WindowStatus } from '../../common/stateMachines.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import { getAircraft } from '../fleet/fleet.service.js';
import { listPendingTasks, markScheduled } from '../tasks/tasks.scheduling.js';
import type { AuditCtx } from '../tasks/tasks.service.js';
import { createWorkOrder } from '../workorders/workorders.service.js';
import { DEFAULT_OVERHEAD_HOURS, planSchedule, type Licence, type SchedWindow } from './scheduler.js';
import { WindowModel } from './window.model.js';

export interface NewWindow {
  aircraftId: string;
  type: 'LINE' | 'BASE' | 'AOG';
  station: string;
  start: Date;
  end: Date;
  capacityHours: number;
  licences?: Licence[];
}

export async function createWindow(input: NewWindow, ctx: AuditCtx) {
  const aircraft = await getAircraft(input.aircraftId); // 404 when the aircraft does not exist
  const win = await WindowModel.create({ ...input, registration: aircraft.registration, createdBy: ctx.actorId });
  await record({
    ...ctx,
    action: 'window.create',
    entityType: 'MaintenanceWindow',
    entityId: String(win._id),
    after: win.toObject(),
  });
  return win;
}

export async function listWindows(q: { page: number; limit: number; aircraftId?: string; status?: string }) {
  const filter: Record<string, unknown> = {};
  if (q.aircraftId) filter.aircraftId = q.aircraftId;
  if (q.status) filter.status = q.status;
  const [data, total] = await Promise.all([
    WindowModel.find(filter)
      .sort({ start: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    WindowModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}

export async function cancelWindow(id: string, ctx: AuditCtx) {
  const win = await WindowModel.findById(id);
  if (!win) throw new AppError(404, 'NOT_FOUND', 'Window not found');
  assertTransition(windowMachine, 'Window', win.status as WindowStatus, 'CANCELLED');
  if (win.bookedHours > 0) {
    throw new AppError(409, 'WINDOW_BOOKED', 'This window already has scheduled work and cannot be cancelled');
  }
  const before = win.toObject();
  win.status = 'CANCELLED';
  await win.save();
  await record({
    ...ctx,
    action: 'window.cancel',
    entityType: 'MaintenanceWindow',
    entityId: id,
    before,
    after: win.toObject(),
  });
  return win;
}

// Read-only: nothing is scheduled until a Planner confirms.
export async function buildPreview(overheadHours: number = DEFAULT_OVERHEAD_HOURS) {
  const [pending, windows] = await Promise.all([
    listPendingTasks(),
    WindowModel.find({ status: 'PLANNED', start: { $gte: new Date() } }).sort({ start: 1 }),
  ]);
  const schedWindows: SchedWindow[] = windows.map((w) => ({
    id: String(w._id),
    aircraftId: String(w.aircraftId),
    start: w.start,
    capacityHours: Math.max(0, w.capacityHours - w.bookedHours), // free hours only
    licences: Array.from(w.licences) as Licence[],
  }));
  const plan = planSchedule(pending, schedWindows, { overheadHours });
  const taskById = new Map(pending.map((t) => [t.id, t] as const));
  const winById = new Map(windows.map((w) => [String(w._id), w] as const));

  return {
    overheadHours,
    items: plan.items.map((item) => {
      const w = winById.get(item.windowId);
      return {
        ...item,
        registration: w?.registration ?? null,
        window: w ? { station: w.station, type: w.type, start: w.start, end: w.end } : null,
        tasks: item.taskIds.map((id) => {
          const t = taskById.get(id);
          return {
            id,
            title: t?.title ?? id,
            durationHours: t?.durationHours ?? 0,
            dueDate: t?.dueDate ?? null,
            priority: t?.priority ?? null,
          };
        }),
      };
    }),
    unscheduled: plan.unscheduled.map((u) => ({ ...u, title: taskById.get(u.taskId)?.title ?? u.taskId })),
    totals: plan.totals,
  };
}

// The server recomputes the plan, so a client cannot choose which tasks go into a window.
export async function confirmWindow(windowId: string, overheadHours: number, ctx: AuditCtx) {
  const preview = await buildPreview(overheadHours);
  const item = preview.items.find((i) => i.windowId === windowId);
  if (!item) throw new AppError(409, 'NOT_IN_PLAN', 'This window has no tasks in the current plan');

  // Reserve capacity atomically so two confirmations cannot overbook the window.
  const reserved = await WindowModel.findOneAndUpdate(
    {
      _id: windowId,
      status: 'PLANNED',
      $expr: { $lte: [{ $add: ['$bookedHours', item.hoursUsed] }, '$capacityHours'] },
    },
    { $inc: { bookedHours: item.hoursUsed } },
    { new: true },
  );
  if (!reserved) throw new AppError(409, 'CONFLICT', 'Window is no longer available or has no free capacity');

  try {
    await markScheduled(item.taskIds, ctx);
  } catch (err) {
    // No multi-document transactions without a replica set, so undo the reservation by hand.
    await WindowModel.updateOne({ _id: windowId }, { $inc: { bookedHours: -item.hoursUsed } });
    throw err;
  }

  const workOrder = await createWorkOrder(
    { aircraftId: item.aircraftId, registration: item.registration ?? '', windowId, taskIds: item.taskIds },
    ctx,
  );
  await record({
    ...ctx,
    action: 'scheduling.confirm',
    entityType: 'MaintenanceWindow',
    entityId: windowId,
    after: {
      workOrderId: String(workOrder._id),
      taskIds: item.taskIds,
      hoursUsed: item.hoursUsed,
      downtimeSavedHours: item.downtimeSavedHours,
    },
  });
  return { workOrder, window: reserved, plan: item };
}