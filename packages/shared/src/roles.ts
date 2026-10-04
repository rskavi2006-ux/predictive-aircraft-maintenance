import { z } from 'zod';

export const ROLES = ['ENGINEER', 'PLANNER', 'AUDITOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];
export const roleSchema = z.enum(ROLES);

export const LICENSE_CATEGORIES = ['B1', 'B2'] as const;
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];