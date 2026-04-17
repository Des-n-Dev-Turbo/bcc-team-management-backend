import { Hono } from "hono";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import * as ROUTES from "@/constants/routes.ts";
import profileRoutes from "@/routes/profile.routes.ts";
import roleRoutes from "@/routes/roles.routes.ts";
import teamMembershipsRouter from "@/routes/team_memberships.routes.ts";
import teamRoutes from "@/routes/teams.routes.ts";
import yearAccessRouter from "@/routes/year_access.routes.ts";
import yearRoutes from "@/routes/years.routes.ts";
import type { AppContext } from "@/types";
import { AppError, getErrorMessage } from "@/utils/error.ts";

const app = new Hono<AppContext>();

app.route(ROUTES.ProfileRoutes.Base, profileRoutes);

app.route(ROUTES.TeamRoutes.Base, teamRoutes);

app.route(ROUTES.YearRoutes.Base, yearRoutes);

app.route(ROUTES.YearAccessRoutes.Base, yearAccessRouter);

app.route(ROUTES.TeamMembershipRoutes.Base, teamMembershipsRouter);

app.route(ROUTES.RolesRoutes.Base, roleRoutes);

app.onError((error, c) => {
  console.log(getErrorMessage(error));

  if (error instanceof AppError) {
    return c.json(
      {
        error: error.message,
        error_code: error.code,
        ...(error.data ? { data: error.data } : {}),
      },
      error.statusCode,
    );
  }

  return c.json(
    {
      error: "Internal Server Error",
      error_code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    },
    500,
  );
});

Deno.serve({ port: 8080 }, app.fetch);
