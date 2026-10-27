import { AppError } from '../middleware/errorHandler.js';

export type Machine<S extends string> = Record<S, readonly S[]>;

export const ALERT_STATUSES = ['OPEN', 'APPROVED', 'REJECTED', 'DEFERRED'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export const alertMachine: Machine<AlertStatus> = {
  OPEN: ['APPROVED', 'REJECTED', 'DEFERRED'],
  DEFERRED: ['APPROVED', 'REJECTED'], // an engineer can decide later
  APPROVED: [],
  REJECTED: [],
};

export const TASK_STATUSES = ['PENDING', 'SCHEDULED', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const taskMachine: Machine<TaskStatus> = {
  PENDING: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['IN_PROGRESS', 'PENDING', 'CANCELLED'],
  IN_PROGRESS: ['DONE', 'CANCELLED'],
  DONE: [],
  CANCELLED: [],
};

export const WINDOW_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
export type WindowStatus = (typeof WINDOW_STATUSES)[number];
export const windowMachine: Machine<WindowStatus> = {
  PLANNED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const WORK_ORDER_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED'] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATUSES)[number];
export const workOrderMachine: Machine<WorkOrderStatus> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
};

export function canTransition<S extends string>(machine: Machine<S>, from: S, to: S): boolean {
  return machine[from].includes(to);
}

export function assertTransition<S extends string>(machine: Machine<S>, entity: string, from: S, to: S): void {
  if (!canTransition(machine, from, to)) {
    throw new AppError(409, 'INVALID_TRANSITION', `${entity} cannot change from ${from} to ${to}`, {
      from,
      to,
      allowed: machine[from],
    });
  }
}