import { Hono } from "hono";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { TaskRoutes } from "@/constants/routes.ts";
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import {
  createTaskBodySchema,
  createTaskQuerySchema,
  getTasksQuerySchema,
} from "@/schemas/tasks.schema.ts";
import {
  createTask,
  getTasksWithScores,
  verifyTeamLead,
} from "@/services/tasks.ts";
import { type AppContext, hasRequiredRole, Role } from "@/types";
import { AppError } from "@/utils/error.ts";
import { getValidated, validate } from "@/utils/validate.ts";

const tasksRouter = new Hono<AppContext>();

tasksRouter.post(
  TaskRoutes.CreateTask,
  supabaseAuth,
  loadProfile,
  requireRole(Role.User),
  requireYearAccess,
  validate("query", createTaskQuerySchema),
  validate("json", createTaskBodySchema),
  async (c) => {
    const { yearId } = getValidated(c, "query", createTaskQuerySchema);
    const { title, maxBaseScore, teamId } = getValidated(
      c,
      "json",
      createTaskBodySchema,
    );

    const userId = c.get("userId");
    const profile = c.get("profile");
    const role = profile.global_role as Role;

    const isAdmin = hasRequiredRole(role, Role.Admin);

    if (teamId) {
      if (!isAdmin) {
        const isLead = await verifyTeamLead({ userId, yearId, teamId });

        if (!isLead) {
          throw new AppError(
            "Only the team lead can create tasks for this team",
            ERROR_CODES.NOT_TEAM_LEAD,
            403,
          );
        }
      }
    } else {
      if (!isAdmin) {
        throw new AppError(
          "Only admins can create global tasks",
          ERROR_CODES.FORBIDDEN,
          403,
        );
      }
    }

    const task = await createTask({ yearId, title, maxBaseScore, teamId });

    return c.json(task, 201);
  },
);

tasksRouter.get(
  TaskRoutes.GetTasks,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Viewer),
  requireYearAccess,
  validate("query", getTasksQuerySchema),
  async (c) => {
    const { yearId, teamId } = getValidated(c, "query", getTasksQuerySchema);

    const result = await getTasksWithScores({ yearId, teamId });

    return c.json(result, 200);
  },
);

export default tasksRouter;
