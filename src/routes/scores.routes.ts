import { Hono } from "hono";

import { ERROR_CODES } from "@/constants/error-codes.ts";
import { ScoreRoutes } from "@/constants/routes.ts";
import { loadProfile, requireRole, supabaseAuth } from "@/middleware";
import {
  awardScoreBodySchema,
  bulkAwardScoreBodySchema,
  editScoreBodySchema,
  editScoreParamsSchema,
  scoreQuerySchema,
} from "@/schemas/scores.schema.ts";
import {
  awardScore,
  bulkAwardScores,
  editBaseScore,
  verifyTeamLead,
} from "@/services/tasks.ts";
import { type AppContext, Role } from "@/types";
import { AppError } from "@/utils/error.ts";
import { getValidated, validate } from "@/utils/validate.ts";

const scoresRouter = new Hono<AppContext>();

scoresRouter.post(
  ScoreRoutes.AwardScore,
  supabaseAuth,
  loadProfile,
  requireRole(Role.User),
  validate("query", scoreQuerySchema),
  validate("json", awardScoreBodySchema),
  async (c) => {
    const { yearId, teamId } = getValidated(c, "query", scoreQuerySchema);
    const { taskId, yearParticipantId, eventType, value } = getValidated(
      c,
      "json",
      awardScoreBodySchema,
    );

    const userId = c.get("userId");

    const isLead = await verifyTeamLead({ userId, yearId, teamId });

    if (!isLead) {
      throw new AppError(
        "Only the team lead can award scores for this team",
        ERROR_CODES.NOT_TEAM_LEAD,
        403,
      );
    }

    const result = await awardScore({
      taskId,
      yearParticipantId,
      eventType,
      value,
      createdBy: userId,
      teamId,
    });

    return c.json(result, 201);
  },
);

scoresRouter.post(
  ScoreRoutes.BulkAwardScore,
  supabaseAuth,
  loadProfile,
  requireRole(Role.User),
  validate("query", scoreQuerySchema),
  validate("json", bulkAwardScoreBodySchema),
  async (c) => {
    const { yearId, teamId } = getValidated(c, "query", scoreQuerySchema);
    const { taskId, scores } = getValidated(
      c,
      "json",
      bulkAwardScoreBodySchema,
    );

    const userId = c.get("userId");

    const isLead = await verifyTeamLead({ userId, yearId, teamId });

    if (!isLead) {
      throw new AppError(
        "Only the team lead can award scores for this team",
        ERROR_CODES.NOT_TEAM_LEAD,
        403,
      );
    }

    const result = await bulkAwardScores({
      taskId,
      scores,
      createdBy: userId,
      teamId,
    });

    return c.json(result, 201);
  },
);

scoresRouter.patch(
  ScoreRoutes.EditScore,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", editScoreParamsSchema),
  validate("json", editScoreBodySchema),
  async (c) => {
    const { scoreEventId } = getValidated(c, "param", editScoreParamsSchema);
    const { value } = getValidated(c, "json", editScoreBodySchema);

    const result = await editBaseScore({ scoreEventId, value });

    return c.json(result, 200);
  },
);

export default scoresRouter;
