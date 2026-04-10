import { Hono } from "hono";
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import {
  addParticipantToTeamQuerySchema,
  addParticipantToTeamSchema,
  removeParticipantFromTeamParamsSchema,
  removeParticipantFromTeamQuerySchema,
  transferParticipantToTeamQuerySchema,
  transferParticipantToTeamSchema,
} from "@/schemas/team_memberships.schema.ts";
import {
  addParticipantToTeam,
  removeParticipantFromTeam,
  transferParticipant,
} from "@/services";
import { type AppContext, Role } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const router = new Hono<AppContext>();

router.post(
  "/",
  supabaseAuth,
  loadProfile,
  requireRole(Role.User),
  requireYearAccess,
  validate("json", addParticipantToTeamSchema),
  validate("query", addParticipantToTeamQuerySchema),
  async (c) => {
    const body = getValidated(c, "json", addParticipantToTeamSchema);

    const { yearId } = getValidated(
      c,
      "query",
      addParticipantToTeamQuerySchema,
    );

    const { id: userId, global_role: role } = c.get("profile");

    const result = await addParticipantToTeam({
      ...body,
      yearId,
      userId,
      role,
    });

    return c.json(result, 201);
  },
);

router.delete(
  "/:membershipId",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", removeParticipantFromTeamParamsSchema),
  validate("query", removeParticipantFromTeamQuerySchema),
  async (c) => {
    const { membershipId } = getValidated(
      c,
      "param",
      removeParticipantFromTeamParamsSchema,
    );

    const { yearId } = getValidated(
      c,
      "query",
      removeParticipantFromTeamQuerySchema,
    );

    const result = await removeParticipantFromTeam({ yearId, membershipId });

    return c.json(result, 200);
  },
);

router.patch(
  "/transfer",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("json", transferParticipantToTeamSchema),
  validate("query", transferParticipantToTeamQuerySchema),
  async (c) => {
    const { membershipId, teamId, toTeamId } = getValidated(
      c,
      "json",
      transferParticipantToTeamSchema,
    );

    const { yearId } = getValidated(
      c,
      "query",
      transferParticipantToTeamQuerySchema,
    );

    const result = await transferParticipant({
      teamId,
      toTeamId,
      membershipId,
      yearId,
    });

    return c.json(result, 200);
  },
);

export default router;
