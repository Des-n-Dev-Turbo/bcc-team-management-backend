import * as z from "@zod/zod";

import { uuidSchema } from "@/schemas/common.schema.ts";

export const addParticipantToTeamSchema = z.object({
  teamId: uuidSchema,
  participantId: uuidSchema,
});

export const addParticipantToTeamQuerySchema = z.object({
  yearId: uuidSchema,
});

export const removeParticipantFromTeamQuerySchema =
  addParticipantToTeamQuerySchema;

export const removeParticipantFromTeamParamsSchema = z.object({
  membershipId: uuidSchema,
});

export const transferParticipantToTeamSchema = z.object({
  teamId: uuidSchema,
  toTeamId: uuidSchema,
  membershipId: uuidSchema,
});

export const transferParticipantToTeamQuerySchema = z.object({
  yearId: uuidSchema,
});
