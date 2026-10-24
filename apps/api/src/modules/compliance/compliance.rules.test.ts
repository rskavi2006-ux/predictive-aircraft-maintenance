import { describe, expect, it } from 'vitest';
import { classifyDue } from './compliance.rules.js';

const now = new Date('2026-01-10T00:00:00Z');
const day = 86_400_000;

describe('classifyDue', () => {
  it('is overdue when the due date has passed', () => {
    expect(classifyDue(new Date(now.getTime() - day), now, 7)).toBe('OVERDUE');
  });

  it('is due soon inside the window, including the last day', () => {
    expect(classifyDue(new Date(now.getTime() + 3 * day), now, 7)).toBe('DUE_SOON');
    expect(classifyDue(new Date(now.getTime() + 7 * day), now, 7)).toBe('DUE_SOON');
  });

  it('is ok when the due date is further away', () => {
    expect(classifyDue(new Date(now.getTime() + 8 * day), now, 7)).toBe('OK');
  });

  it('treats a due date equal to now as not yet overdue', () => {
    expect(classifyDue(now, now, 7)).toBe('DUE_SOON');
  });
});