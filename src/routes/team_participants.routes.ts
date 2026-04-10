import { Hono } from "hono";

import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import { getTeamParticipantsParamsSchema } from "@/schemas/year_participants.schema.ts";
import { getTeamYearParticipants } from "@/services";
import { type AppContext, Role } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const teamParticipantsRouter = new Hono<AppContext>();

teamParticipantsRouter.get(
  "/:teamId/participants",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Viewer),
  requireYearAccess,
  validate("param", getTeamParticipantsParamsSchema),
  async (c) => {
    const { yearId, teamId } = getValidated(
      c,
      "param",
      getTeamParticipantsParamsSchema,
    );

    const userId = c.get("userId");
    const role = c.get("profile").global_role as Role;

    const participants = await getTeamYearParticipants({
      yearId,
      teamId,
      userId,
      role,
    });

    return c.json(participants, 200);
  },
);

export default teamParticipantsRouter;
