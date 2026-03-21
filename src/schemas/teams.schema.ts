import * as z from '@zod/zod';

import { nameSchema, uuidSchema } from './common.schema.ts';

export const createTeamSchema = z.object({
  name: nameSchema,
  yearId: uuidSchema,
});

export const getTeamsSchema = z.object({
  yearId: uuidSchema,
});

export const updateTeamNameParamsSchema = z.object({
  teamId: uuidSchema,
});

export const updateTeamNameSchema = z.object({
  name: nameSchema,
});
