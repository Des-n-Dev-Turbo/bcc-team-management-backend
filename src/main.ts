import { Hono } from 'hono';

import profileRoutes from '@/routes/profile.routes.ts';
import teamRoutes from '@/routes/teams.routes.ts';
import yearRoutes from '@/routes/years.routes.ts';
import yearAccessRouter from '@/routes/year_access.routes.ts';
import teamMembershipsRouter from '@/routes/team_memberships.routes.ts';

import { AppError, getErrorMessage } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

import type { AppContext } from '@/types';

const app = new Hono<AppContext>();

app.route('/profile', profileRoutes);

app.route('/teams', teamRoutes);

app.route('/years', yearRoutes);

app.route('/year-access', yearAccessRouter);

app.route('/team_memberships', teamMembershipsRouter);

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
      error: 'Internal Server Error',
      error_code: ERROR_CODES.INTERNAL_SERVER_ERROR,
    },
    500,
  );
});

Deno.serve({ port: 8080 }, app.fetch);
