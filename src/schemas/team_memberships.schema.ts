import * as z from '@zod/zod';

import { uuidSchema } from '@/schemas/common.schema.ts';

export const addParticipantToTeamSchema = z.object({
  teamId: uuidSchema,
  participantId: uuidSchema,
});

export const addParticipantToTeamQuerySchema = z.object({
  yearId: uuidSchema,
});
