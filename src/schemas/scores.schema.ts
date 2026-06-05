import * as zod from "@zod/zod";

import { uuidSchema } from "./common.schema.ts";

export const eventTypeSchema = zod.enum([
  "base",
  "gold",
  "silver",
  "bronze",
  "bonus",
]);

export const scoreQuerySchema = zod.object({
  yearId: uuidSchema,
  teamId: uuidSchema,
});

export const awardScoreBodySchema = zod.object({
  taskId: uuidSchema,
  yearParticipantId: uuidSchema,
  eventType: eventTypeSchema,
  value: zod.number().int().min(0),
});

export const bulkScoreEntrySchema = zod.object({
  yearParticipantId: uuidSchema,
  eventType: eventTypeSchema,
  value: zod.number().int().min(0),
});

export const bulkAwardScoreBodySchema = zod.object({
  taskId: uuidSchema,
  scores: zod.array(bulkScoreEntrySchema).min(1),
});

export const editScoreParamsSchema = zod.object({
  scoreEventId: uuidSchema,
});

export const editScoreBodySchema = zod.object({
  value: zod.number().int().min(0),
});
