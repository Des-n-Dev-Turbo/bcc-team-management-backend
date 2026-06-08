import { Hono } from "hono";
import { LeaderboardRoutes } from "@/constants/routes.ts";
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import { getLeaderboardQuerySchema } from "@/schemas/leaderboard.schema.ts";
import {
  getTeamLeaderboard,
  getYearLeaderboard,
} from "@/services/leadership.ts";
import { type AppContext, Role } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const router = new Hono<AppContext>();

router.get(
  LeaderboardRoutes.GetLeaderboard,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Viewer),
  requireYearAccess,
  validate("query", getLeaderboardQuerySchema),
  async (c) => {
    const { yearId, teamId } = getValidated(
      c,
      "query",
      getLeaderboardQuerySchema,
    );

    if (teamId) {
      const teamLeaderboard = await getTeamLeaderboard({ yearId, teamId });

      return c.json(teamLeaderboard, 200);
    }

    const yearLeaderboard = await getYearLeaderboard({ yearId });

    return c.json(yearLeaderboard, 200);
  },
);

export default router;
