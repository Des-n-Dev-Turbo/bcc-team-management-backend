import * as z from "@zod/zod";
import { uuidSchema } from "@/schemas/common.schema.ts";

export const getLeaderboardQuerySchema = z.object({
  yearId: uuidSchema,
  teamId: uuidSchema.optional(),
});
