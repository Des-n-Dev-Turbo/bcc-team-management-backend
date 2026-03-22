import * as zod from '@zod/zod';

import { nameSchema, uuidSchema } from './common.schema.ts';

export const yearParticipantsParamsSchema = zod.object({
  yearId: uuidSchema,
});

export const yearParticipantsSchema = zod.object({
  userId: uuidSchema.optional(),
  name: nameSchema,
  email: zod.email(),
  mobile: zod
    .string()
    .trim()
    .length(10)
    .regex(/^\d{10}$/),
  regId: zod.string().trim().min(5).max(12).optional(),
});
