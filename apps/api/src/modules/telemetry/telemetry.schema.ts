import { z } from 'zod';
import { objectIdSchema } from '../../common/pagination.js';

const readingInput = z
  .object({
    componentId: objectIdSchema.transform((s) => s.toLowerCase()),
    timestamp: z.coerce.date(),
    egt: z.number().optional(),
    vibration: z.number().optional(),
    oilPressure: z.number().optional(),
    oilTemp: z.number().optional(),
  })
  .refine((r) => [r.egt, r.vibration, r.oilPressure, r.oilTemp].some((v) => v !== undefined), {
    message: 'At least one measurement is required',
  });

export const batchSchema = z.object({ readings: z.array(readingInput).min(1).max(1000) });
export type ReadingInput = z.infer<typeof readingInput>;

export const readingsQuery = z.object({
  componentId: objectIdSchema,
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  maxPoints: z.coerce.number().int().min(10).max(2000).default(300),
});