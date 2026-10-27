export type DueState = 'OVERDUE' | 'DUE_SOON' | 'OK';

// Pure function, easy to test: where does a due date stand compared with "now"?
export function classifyDue(dueDate: Date, now: Date, soonDays: number): DueState {
  if (dueDate.getTime() < now.getTime()) return 'OVERDUE';
  if (dueDate.getTime() <= now.getTime() + soonDays * 86_400_000) return 'DUE_SOON';
  return 'OK';
}