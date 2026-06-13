import { Hono } from "hono";
import { YearRoutes, YearScoresStandardRoutes } from "@/constants/routes.ts";
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import { yearParticipantsParamsSchema } from "@/schemas/year_participants.schema.ts";
import {
  createYearSchema,
  lockYearSchema,
  setYearScoresStandardBodySchema,
  yearScoresStandardParamsSchema,
} from "@/schemas/years.schema.ts";
import {
  createYear,
  getTeamLeadsForYear,
  getYearScoresStandard,
  getYears,
  lockYear,
  setYearScoresStandard,
} from "@/services";

import { type AppContext, Role } from "@/types";

import { getValidated, validate } from "@/utils/validate.ts";
import teamParticipantsRouter from "./team_participants.routes.ts";
import yearsParticipantRouter from "./year_participants.routes.ts";

const router = new Hono<AppContext>();

router.post(
  YearRoutes.CreateYear,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Superadmin),
  validate("json", createYearSchema),
  async (c) => {
    const { name, year } = getValidated(c, "json", createYearSchema);

    const newYear = await createYear({ name, year });
    return c.json(newYear, 201);
  },
);

router.post(
  YearRoutes.Lock,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", lockYearSchema),
  async (c) => {
    const { yearId } = getValidated(c, "param", lockYearSchema);
    const lockedYear = await lockYear(yearId);
    return c.json(lockedYear, 200);
  },
);

router.get(YearRoutes.GetYears, supabaseAuth, loadProfile, async (c) => {
  const userId = c.get("userId");

  const profile = c.get("profile");

  const years = await getYears({ userId, role: profile.global_role });

  return c.json(years, 200);
});

router.get(
  YearRoutes.GetTeamLeads,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearParticipantsParamsSchema),
  async (c) => {
    const { yearId } = getValidated(c, "param", yearParticipantsParamsSchema);

    const result = await getTeamLeadsForYear(yearId);

    return c.json(result, 200);
  },
);

router.post(
  YearScoresStandardRoutes.SetStandard,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearScoresStandardParamsSchema),
  validate("json", setYearScoresStandardBodySchema),
  async (c) => {
    const { yearId } = getValidated(c, "param", yearScoresStandardParamsSchema);
    const values = getValidated(c, "json", setYearScoresStandardBodySchema);

    const result = await setYearScoresStandard({ yearId, values });

    return c.json(result, 201);
  },
);

router.get(
  YearScoresStandardRoutes.GetStandard,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Viewer),
  requireYearAccess,
  validate("param", yearScoresStandardParamsSchema),
  async (c) => {
    const { yearId } = getValidated(c, "param", yearScoresStandardParamsSchema);

    const result = await getYearScoresStandard({ yearId });

    return c.json(result, 200);
  },
);

router.route(YearRoutes.Participants, yearsParticipantRouter);

router.route(YearRoutes.TeamParticipants, teamParticipantsRouter);

export default router;
