import * as z from "@zod/zod";

import { nameSchema, uuidSchema } from "./common.schema.ts";

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

export const teamIdsParamsSchema = z.object({
  teamIds: z.array(uuidSchema).min(1, "At least one team ID must be provided"),
});

export const teamScoresConfigParamsSchema = z.object({
  teamId: uuidSchema,
});

export const teamScoresConfigQuerySchema = z.object({
  yearId: uuidSchema,
});

export const setTeamScoresConfigBodySchema = z.object({
  gold: z.int().min(1),
  silver: z.int().min(1),
  bronze: z.int().min(1),
  bonus: z.int().min(1),
});
