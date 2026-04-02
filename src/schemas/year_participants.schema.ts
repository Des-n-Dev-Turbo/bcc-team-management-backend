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

export const getYearParticipantsQuerySchema = zod.object({
  page: zod
    .string()
    .optional()
    .transform((val) => parseInt(val ?? '1', 10))
    .pipe(zod.number().min(1)),
  name: zod
    .string()
    .optional()
    .transform((val) => val?.trim()),
  email: zod
    .string()
    .optional()
    .transform((val) => val?.trim()),
  mobile: zod
    .string()
    .optional()
    .transform((val) => val?.trim()),
  sort: zod.enum(['name', 'email']).optional().default('name'),
  order: zod.enum(['asc', 'desc']).optional().default('asc'),
});

export const getTeamParticipantsParamsSchema = zod.object({
  yearId: uuidSchema,
  teamId: uuidSchema,
});

export const yearParticipantsBanParamsSchema = zod.object({
  participantId: uuidSchema,
  yearId: uuidSchema,
});

export const yearParticipantsUnbanParamsSchema =
  yearParticipantsBanParamsSchema;

export const yearParticipantsUnbanQuerySchema = zod.object({
  restoreAuth: zod.stringbool().optional(),
});
