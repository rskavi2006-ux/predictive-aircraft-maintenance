import { describe, expect, it } from 'vitest';
import { planSchedule, type SchedTask, type SchedWindow } from './scheduler.js';

const D = (days: number) => new Date(Date.UTC(2026, 0, 1) + days * 86_400_000);
const task = (id: string, over: Partial<SchedTask> = {}): SchedTask => ({
  id,
  aircraftId: 'A1',
  priority: 'MEDIUM',
  requiredLicense: 'B1',
  durationHours: 3,
  dueDate: D(10),
  ...over,
});
const win = (id: string, over: Partial<SchedWindow> = {}): SchedWindow => ({
  id,
  aircraftId: 'A1',
  start: D(5),
  capacityHours: 12,
  ...over,
});

describe('planSchedule', () => {
  it('handles empty input', () => {
    const plan = planSchedule([], []);
    expect(plan.items).toEqual([]);
    expect(plan.unscheduled).toEqual([]);
    expect(plan.totals).toEqual({ tasksScheduled: 0, windowsUsed: 0, downtimeSavedHours: 0 });
  });

  it('bundles tasks of one aircraft into a single window and reports downtime saved', () => {
    const plan = planSchedule([task('t1'), task('t2')], [win('w1')]);
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0].taskIds.sort()).toEqual(['t1', 't2']);
    expect(plan.items[0].hoursUsed).toBe(6);
    expect(plan.items[0].downtimeSavedHours).toBe(4);
    expect(plan.unscheduled).toEqual([]);
  });

  it('saves one setup per extra task', () => {
    const plan = planSchedule([task('t1'), task('t2'), task('t3')], [win('w1')]);
    expect(plan.totals.downtimeSavedHours).toBe(8);
  });

  it('uses the configured setup overhead', () => {
    const plan = planSchedule([task('t1'), task('t2')], [win('w1')], { overheadHours: 2 });
    expect(plan.totals.downtimeSavedHours).toBe(2);
  });

  it('splits across windows when capacity is short, largest first, and explains why', () => {
    const tasks = [task('big', { durationHours: 8 }), task('s1'), task('s2')];
    const windows = [win('w1', { capacityHours: 10 }), win('w2', { start: D(6), capacityHours: 10 })];
    const plan = planSchedule(tasks, windows);
    expect(plan.items).toHaveLength(2);
    expect(plan.items[0].windowId).toBe('w1');
    expect(plan.items[0].taskIds).toEqual(['big']);
    expect(plan.items[0].notes[0]).toContain('did not fit');
    expect(plan.items[1].windowId).toBe('w2');
    expect(plan.items[1].taskIds.sort()).toEqual(['s1', 's2']);
    expect(plan.unscheduled).toEqual([]);
  });

  it('gives AOG tasks priority when the window cannot hold everything', () => {
    const tasks = [
      task('routine', { durationHours: 6 }),
      task('urgent', { durationHours: 6, priority: 'AOG_RISK', dueDate: D(12) }),
    ];
    const plan = planSchedule(tasks, [win('w1', { capacityHours: 6 })]);
    expect(plan.items[0].taskIds).toEqual(['urgent']);
    expect(plan.unscheduled).toHaveLength(1);
    expect(plan.unscheduled[0]).toMatchObject({ taskId: 'routine', reason: 'NO_CAPACITY' });
  });

  it('reports a task that would miss its due limit', () => {
    const plan = planSchedule([task('late', { dueDate: D(3) })], [win('w1')]);
    expect(plan.items).toEqual([]);
    expect(plan.unscheduled[0]).toMatchObject({ taskId: 'late', reason: 'NO_WINDOW_BEFORE_DUE' });
    expect(plan.unscheduled[0].message).toContain('would miss its due limit');
  });

  it('only bundles tasks whose due date is after the window start', () => {
    const plan = planSchedule([task('ok'), task('early', { dueDate: D(4) })], [win('w1')]);
    expect(plan.items[0].taskIds).toEqual(['ok']);
    expect(plan.unscheduled[0]).toMatchObject({ taskId: 'early', reason: 'NO_WINDOW_BEFORE_DUE' });
  });

  it('rejects a licence mismatch', () => {
    const plan = planSchedule([task('t1', { requiredLicense: 'B2' })], [win('w1', { licences: ['B1'] })]);
    expect(plan.items).toEqual([]);
    expect(plan.unscheduled[0]).toMatchObject({ taskId: 't1', reason: 'LICENCE_MISMATCH' });
  });

  it('reports when the aircraft has no window at all', () => {
    const plan = planSchedule([task('t1')], []);
    expect(plan.unscheduled[0]).toMatchObject({ taskId: 't1', reason: 'NO_WINDOW' });
  });

  it('ignores windows that belong to another aircraft', () => {
    const plan = planSchedule([task('t1')], [win('w1', { aircraftId: 'A2' })]);
    expect(plan.items).toEqual([]);
    expect(plan.unscheduled[0].reason).toBe('NO_WINDOW');
  });

  it('reports a task that is longer than any window', () => {
    const plan = planSchedule([task('huge', { durationHours: 20 })], [win('w1', { capacityHours: 12 })]);
    expect(plan.unscheduled[0]).toMatchObject({ taskId: 'huge', reason: 'NO_CAPACITY' });
  });
});