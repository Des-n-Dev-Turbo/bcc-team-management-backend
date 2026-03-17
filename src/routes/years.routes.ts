import { Hono } from 'hono';

import { supabaseAuth, loadProfile, requireRole } from '@/middleware';
import { createYear } from '@/services';

import { type AppContext, Role } from '@/types';
import { AppError, getErrorMessage } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

const router = new Hono<AppContext>();

router.post(
  '/',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Superadmin),
  async (c) => {
    let body;

    try {
      body = await c.req.json();
    } catch {
      throw new AppError(
        'Invalid JSON body',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const year = Number(body.year);

    if (!name || Number.isNaN(year) || year < 2000 || year > 2100) {
      throw new AppError(
        'Invalid name or year',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    try {
      const newYear = await createYear({ name, year });
      return c.json(newYear, 201);
    } catch (error) {
      console.error(getErrorMessage(error));

      if (error instanceof AppError) {
        return c.json({ error: error.message }, error.statusCode);
      }

      return c.json({ error: 'Internal Server Error' }, 500);
    }
  },
);

export default router;
