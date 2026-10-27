export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'AOG_RISK'] as const;
export type Priority = (typeof PRIORITIES)[number];
// Lower rank = more urgent (used for sorting queues).
export const PRIORITY_RANK: Record<Priority, number> = { AOG_RISK: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };