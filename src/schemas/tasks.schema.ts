import * as zod from "@zod/zod";

import { uuidSchema } from "./common.schema.ts";

export const createTaskQuerySchema = zod.object({
  yearId: uuidSchema,
});

export const createTaskBodySchema = zod.object({
  title: zod.string().trim().min(1).max(100),
  maxBaseScore: zod.number().int().min(0),
  teamId: uuidSchema.optional(),
});

export const getTasksQuerySchema = zod.object({
  yearId: uuidSchema,
  teamId: uuidSchema,
});
