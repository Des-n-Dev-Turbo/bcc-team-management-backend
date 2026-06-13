import { Hono } from "hono";

import { TeamScoresConfigRoutes } from "@/constants/routes.ts";
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import {
  setTeamScoresConfigBodySchema,
  teamScoresConfigParamsSchema,
  teamScoresConfigQuerySchema,
} from "@/schemas/teams.schema.ts";
import {
  getTeamScoresConfig,
  setTeamScoresConfig,
} from "@/services/team_scores_config.ts";
import { type AppContext, Role } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const teamScoresConfigRouter = new Hono<AppContext>();

teamScoresConfigRouter.post(
  TeamScoresConfigRoutes.SetConfig,
  supabaseAuth,
  loadProfile,
  requireRole(Role.User),
  requireYearAccess,
  validate("param", teamScoresConfigParamsSchema),
  validate("query", teamScoresConfigQuerySchema),
  validate("json", setTeamScoresConfigBodySchema),
  async (c) => {
    const { teamId } = getValidated(c, "param", teamScoresConfigParamsSchema);
    const { yearId } = getValidated(c, "query", teamScoresConfigQuerySchema);
    const values = getValidated(c, "json", setTeamScoresConfigBodySchema);

    const result = await setTeamScoresConfig({ teamId, yearId, values });

    return c.json(result, 201);
  },
);

teamScoresConfigRouter.get(
  TeamScoresConfigRoutes.GetConfig,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Viewer),
  requireYearAccess,
  validate("param", teamScoresConfigParamsSchema),
  validate("query", teamScoresConfigQuerySchema),
  async (c) => {
    const { teamId } = getValidated(c, "param", teamScoresConfigParamsSchema);
    const { yearId } = getValidated(c, "query", teamScoresConfigQuerySchema);

    const result = await getTeamScoresConfig({ teamId, yearId });

    return c.json(result, 200);
  },
);

export default teamScoresConfigRouter;
