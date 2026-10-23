import { describe, expect, it } from 'vitest';
import {
  alertMachine,
  assertTransition,
  canTransition,
  taskMachine,
  windowMachine,
  workOrderMachine,
} from './stateMachines.js';

describe('state machines', () => {
  it('lets an OPEN alert be approved, rejected or deferred', () => {
    for (const to of ['APPROVED', 'REJECTED', 'DEFERRED'] as const) {
      expect(canTransition(alertMachine, 'OPEN', to)).toBe(true);
    }
  });

  it('lets a deferred alert be decided later but never changes a decided one', () => {
    expect(canTransition(alertMachine, 'DEFERRED', 'APPROVED')).toBe(true);
    expect(canTransition(alertMachine, 'APPROVED', 'REJECTED')).toBe(false);
    expect(() => assertTransition(alertMachine, 'Alert', 'REJECTED', 'APPROVED')).toThrow(/cannot change/);
  });

  it('follows the task lifecycle', () => {
    expect(canTransition(taskMachine, 'PENDING', 'SCHEDULED')).toBe(true);
    expect(canTransition(taskMachine, 'PENDING', 'DONE')).toBe(false);
    expect(canTransition(taskMachine, 'DONE', 'PENDING')).toBe(false);
  });

  it('follows the window and work order lifecycles', () => {
    expect(canTransition(windowMachine, 'PLANNED', 'ACTIVE')).toBe(true);
    expect(canTransition(windowMachine, 'COMPLETED', 'ACTIVE')).toBe(false);
    expect(canTransition(workOrderMachine, 'OPEN', 'COMPLETED')).toBe(false);
    expect(canTransition(workOrderMachine, 'IN_PROGRESS', 'COMPLETED')).toBe(true);
  });
});