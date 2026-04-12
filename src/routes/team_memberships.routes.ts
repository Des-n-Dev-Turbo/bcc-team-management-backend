import { Hono } from "hono";
import { TeamMembershipRoutes } from "@/constants/routes.ts";
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import {
  addParticipantToTeamQuerySchema,
  addParticipantToTeamSchema,
  demoteFromTeamLeadBodySchema,
  demoteFromTeamLeadParamsSchema,
  demoteFromTeamLeadQuerySchema,
  promoteToTeamLeadBodySchema,
  promoteToTeamLeadParamsSchema,
  promoteToTeamLeadQuerySchema,
  removeParticipantFromTeamParamsSchema,
  removeParticipantFromTeamQuerySchema,
  transferParticipantToTeamQuerySchema,
  transferParticipantToTeamSchema,
} from "@/schemas/team_memberships.schema.ts";
import {
  addParticipantToTeam,
  demoteFromTeamLead,
  promoteToTeamLead,
  removeParticipantFromTeam,
  transferParticipant,
} from "@/services";
import { type AppContext, Role } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const router = new Hono<AppContext>();

router.post(
  TeamMembershipRoutes.AddParticipant,
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
  TeamMembershipRoutes.RemoveById,
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
  TeamMembershipRoutes.Transfer,
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

router.patch(
  TeamMembershipRoutes.PromoteById,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", promoteToTeamLeadParamsSchema),
  validate("json", promoteToTeamLeadBodySchema),
  validate("query", promoteToTeamLeadQuerySchema),
  async (c) => {
    const { membershipId } = getValidated(
      c,
      "param",
      promoteToTeamLeadParamsSchema,
    );

    const { participantId, teamId } = getValidated(
      c,
      "json",
      promoteToTeamLeadBodySchema,
    );

    const { yearId } = getValidated(c, "query", promoteToTeamLeadQuerySchema);

    const result = await promoteToTeamLead({
      membershipId,
      participantId,
      teamId,
      yearId,
    });

    return c.json(result, 200);
  },
);

router.patch(
  TeamMembershipRoutes.DemoteById,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", demoteFromTeamLeadParamsSchema),
  validate("json", demoteFromTeamLeadBodySchema),
  validate("query", demoteFromTeamLeadQuerySchema),
  async (c) => {
    const params = getValidated(c, "param", demoteFromTeamLeadParamsSchema);

    const body = getValidated(c, "json", demoteFromTeamLeadBodySchema);

    const query = getValidated(c, "query", demoteFromTeamLeadQuerySchema);

    const result = await demoteFromTeamLead({ ...params, ...body, ...query });

    return c.json(result, 200);
  },
);

export default router;
