import * as z from '@zod/zod';

import { nameSchema, uuidSchema } from './common.schema.ts';

export const createYearSchema = z.object({
  name: nameSchema,
  year: z.int().min(2000).max(2100),
});

export const lockYearSchema = z.object({
  yearId: uuidSchema,
});
