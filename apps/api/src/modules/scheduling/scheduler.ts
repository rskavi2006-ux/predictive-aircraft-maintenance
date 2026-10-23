import type { Priority } from '../../common/priority.js';

export type Licence = 'B1' | 'B2';

export interface SchedTask {
  id: string;
  aircraftId: string;
  priority: Priority;
  requiredLicense: Licence;
  durationHours: number;
  dueDate: Date;
}

export interface SchedWindow {
  id: string;
  aircraftId: string;
  start: Date;
  capacityHours: number;
  licences?: Licence[]; // licence categories available in the crew; default B1 and B2
}

export type UnscheduledReason = 'NO_WINDOW' | 'NO_WINDOW_BEFORE_DUE' | 'LICENCE_MISMATCH' | 'NO_CAPACITY';

export interface PlanItem {
  windowId: string;
  aircraftId: string;
  taskIds: string[];
  hoursUsed: number;
  capacityHours: number;
  downtimeSavedHours: number;
  notes: string[];
}

export interface Unscheduled {
  taskId: string;
  aircraftId: string;
  reason: UnscheduledReason;
  message: string;
}

export interface Plan {
  items: PlanItem[];
  unscheduled: Unscheduled[];
  totals: { tasksScheduled: number; windowsUsed: number; downtimeSavedHours: number };
}

// Assumption: fixed setup and access time paid once per window. Bundling n tasks saves (n - 1) setups.
export const DEFAULT_OVERHEAD_HOURS = 4;

const ALL_LICENCES: Licence[] = ['B1', 'B2'];
const licencesOf = (w: SchedWindow) => w.licences ?? ALL_LICENCES;
const aog = (t: SchedTask) => (t.priority === 'AOG_RISK' ? 1 : 0);
const time = (d: Date) => d.getTime();

// Most urgent first: AOG, then earliest due date.
const byUrgency = (a: SchedTask, b: SchedTask) => aog(b) - aog(a) || time(a.dueDate) - time(b.dueDate);

function explain(task: SchedTask, windows: SchedWindow[]): Unscheduled {
  const base = { taskId: task.id, aircraftId: task.aircraftId };
  const due = task.dueDate.toISOString().slice(0, 10);
  if (windows.length === 0) {
    return { ...base, reason: 'NO_WINDOW', message: 'No maintenance window exists for this aircraft' };
  }
  const before = windows.filter((w) => time(w.start) <= time(task.dueDate));
  if (before.length === 0) {
    return {
      ...base,
      reason: 'NO_WINDOW_BEFORE_DUE',
      message: `No window starts before the due date (${due}): this task would miss its due limit`,
    };
  }
  if (!before.some((w) => licencesOf(w).includes(task.requiredLicense))) {
    return {
      ...base,
      reason: 'LICENCE_MISMATCH',
      message: `No window before ${due} has a ${task.requiredLicense} engineer`,
    };
  }
  return {
    ...base,
    reason: 'NO_CAPACITY',
    message: 'The windows before the due date do not have enough free hours for this task',
  };
}

// Greedy, first-fit by window start. Pure function: no database, no clock, easy to test.
export function planSchedule(
  tasks: SchedTask[],
  windows: SchedWindow[],
  opts: { overheadHours: number } = { overheadHours: DEFAULT_OVERHEAD_HOURS },
): Plan {
  const items: PlanItem[] = [];
  const unscheduled: Unscheduled[] = [];
  const aircraftIds = [...new Set(tasks.map((t) => t.aircraftId))];

  for (const aircraftId of aircraftIds) {
    let remaining = tasks.filter((t) => t.aircraftId === aircraftId).sort(byUrgency);
    const own = windows
      .filter((w) => w.aircraftId === aircraftId)
      .sort((a, b) => time(a.start) - time(b.start));

    for (const w of own) {
      if (remaining.length === 0) break;
      // A window must start before the task's due date and have the right licence on the crew.
      const eligible = remaining.filter(
        (t) => time(w.start) <= time(t.dueDate) && licencesOf(w).includes(t.requiredLicense),
      );
      if (eligible.length === 0) continue;

      const total = eligible.reduce((sum, t) => sum + t.durationHours, 0);
      const notes: string[] = [];
      let chosen: SchedTask[];
      if (total <= w.capacityHours) {
        chosen = eligible;
      } else {
        // Split: AOG first, then largest first, first-fit until the window is full.
        const order = [...eligible].sort(
          (a, b) => aog(b) - aog(a) || b.durationHours - a.durationHours || time(a.dueDate) - time(b.dueDate),
        );
        let used = 0;
        chosen = [];
        for (const t of order) {
          if (used + t.durationHours <= w.capacityHours) {
            chosen.push(t);
            used += t.durationHours;
          }
        }
        const left = eligible.length - chosen.length;
        notes.push(`${left} task(s) did not fit in this window (capacity ${w.capacityHours}h) and move to the next one`);
      }
      if (chosen.length === 0) continue;

      items.push({
        windowId: w.id,
        aircraftId,
        taskIds: chosen.map((t) => t.id),
        hoursUsed: chosen.reduce((sum, t) => sum + t.durationHours, 0),
        capacityHours: w.capacityHours,
        downtimeSavedHours: (chosen.length - 1) * opts.overheadHours,
        notes,
      });
      const placed = new Set(chosen.map((t) => t.id));
      remaining = remaining.filter((t) => !placed.has(t.id));
    }

    for (const t of remaining) unscheduled.push(explain(t, own));
  }

  return {
    items,
    unscheduled,
    totals: {
      tasksScheduled: items.reduce((sum, i) => sum + i.taskIds.length, 0),
      windowsUsed: items.length,
      downtimeSavedHours: items.reduce((sum, i) => sum + i.downtimeSavedHours, 0),
    },
  };
}