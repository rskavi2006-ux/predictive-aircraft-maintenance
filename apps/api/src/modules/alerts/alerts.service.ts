import { envelope } from '../../common/pagination.js';
import { PRIORITY_RANK, type Priority } from '../../common/priority.js';
import { alertMachine, assertTransition, type AlertStatus } from '../../common/stateMachines.js';
import { AppError } from '../../middleware/errorHandler.js';
import { record } from '../audit/audit.service.js';
import { getComponent } from '../components/components.service.js';
import { getAircraft } from '../fleet/fleet.service.js';
import type { Prediction } from '../scoring/prediction.js';
import { createFromAlert, hasActiveTaskForComponent, type AuditCtx } from '../tasks/tasks.service.js';
import { AlertModel } from './alert.model.js';
import { causeFor, priorityFor, shouldAlert } from './alert.rules.js';

// Called after every scoring run. Returns the new alert, or null when none was created.
export async function evaluateAlert(componentId: string, prediction: Prediction) {
  if (!shouldAlert(prediction)) return null;
  const cause = causeFor(prediction);
  const priority = priorityFor(prediction);
  const evidence = {
    healthScore: prediction.healthScore,
    failureProbability: prediction.failureProbability,
    rulDays: prediction.rulDays,
    confidence: prediction.confidence,
    contributingFactors: prediction.contributingFactors,
    priority,
    priorityRank: PRIORITY_RANK[priority],
  };

  // De-duplication: an OPEN alert for the same component and cause just gets fresher evidence.
  await AlertModel.updateOne({ componentId, cause, active: true, status: 'OPEN' }, { $set: evidence });
  if (await AlertModel.exists({ componentId, cause, active: true })) return null; // open or deferred
  if (await hasActiveTaskForComponent(componentId)) return null; // already being handled

  const component = await getComponent(componentId);
  if (!component.aircraftId) return null; // not installed on an aircraft
  const aircraft = await getAircraft(String(component.aircraftId));
  try {
    return await AlertModel.create({
      ...evidence,
      aircraftId: component.aircraftId,
      registration: aircraft.registration,
      componentId: component._id,
      componentName: component.name,
      cause,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null; // lost a race with another ingest
    throw err;
  }
}

export async function listAlerts(q: {
  page: number;
  limit: number;
  status?: string;
  priority?: string;
  aircraftId?: string;
  componentId?: string;
}) {
  const filter: Record<string, unknown> = {};
  if (q.status) filter.status = q.status;
  if (q.priority) filter.priority = q.priority;
  if (q.aircraftId) filter.aircraftId = q.aircraftId;
  if (q.componentId) filter.componentId = q.componentId;
  const [data, total] = await Promise.all([
    AlertModel.find(filter)
      .sort({ priorityRank: 1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    AlertModel.countDocuments(filter),
  ]);
  return envelope(data, q.page, q.limit, total);
}

export async function getAlert(id: string) {
  const alert = await AlertModel.findById(id);
  if (!alert) throw new AppError(404, 'NOT_FOUND', 'Alert not found');
  return alert;
}

const TARGET = { approve: 'APPROVED', reject: 'REJECTED', defer: 'DEFERRED' } as const;
export type Decision = keyof typeof TARGET;

export async function decideAlert(id: string, decision: Decision, note: string, ctx: AuditCtx) {
  const alert = await getAlert(id);
  const from = alert.status as AlertStatus;
  const to: AlertStatus = TARGET[decision];
  assertTransition(alertMachine, 'Alert', from, to);

  const before = alert.toObject();
  // Conditional update: if someone else decided in the meantime, this matches nothing.
  const updated = await AlertModel.findOneAndUpdate(
    { _id: alert._id, status: from },
    {
      $set: {
        status: to,
        active: to === 'DEFERRED',
        decidedBy: ctx.actorId,
        decidedAt: new Date(),
        decisionNote: note,
      },
    },
    { new: true },
  );
  if (!updated) throw new AppError(409, 'CONFLICT', 'Alert was changed by someone else, reload and retry');

  let task = null;
  if (to === 'APPROVED') {
    const component = await getComponent(String(updated.componentId));
    task = await createFromAlert(
      {
        alertId: String(updated._id),
        aircraftId: String(updated.aircraftId),
        registration: updated.registration ?? '',
        componentId: String(updated.componentId),
        componentName: updated.componentName ?? component.name,
        ataChapter: component.ataChapter,
        kind: component.kind,
        rulDays: updated.rulDays ?? null,
        priority: updated.priority as Priority,
      },
      ctx,
    );
    updated.taskId = task._id;
    await updated.save();
  }

  await record({
    ...ctx,
    action: `alert.${decision}`,
    entityType: 'Alert',
    entityId: id,
    before,
    after: updated.toObject(),
  });
  return { alert: updated, task };
}