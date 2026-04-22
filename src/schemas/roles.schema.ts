import * as z from "@zod/zod";
import { Role } from "@/types";
import { uuidSchema } from "./common.schema.ts";

export const usersRoleChangeParamsSchema = z.object({
  userId: uuidSchema,
});

export const usersRoleChangeBodySchema = z.object({
  currentRole: z.enum([Role.Admin, Role.User, Role.Viewer]),
  targetRole: z.enum([Role.Admin, Role.User, Role.Viewer]),
  profileId: uuidSchema,
});
