import { z } from 'zod';

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Standard list envelope used by every list endpoint.
export function envelope<T>(data: T[], page: number, limit: number, total: number) {
  return { data, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}