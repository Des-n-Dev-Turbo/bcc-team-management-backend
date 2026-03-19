import { Hono } from 'hono';
import * as uuid from 'jsr:@std/uuid';

import { supabaseAuth, loadProfile, requireRole } from '@/middleware';
import { createYear, lockYear } from '@/services';

import { type AppContext, Role } from '@/types';
import { AppError } from '@/utils/error.ts';
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

    const newYear = await createYear({ name, year });
    return c.json(newYear, 201);
  },
);

router.post(
  '/:yearId/lock',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  async (c) => {
    const yearId = c.req.param('yearId');

    if (!yearId) {
      throw new AppError(
        'Year ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    if (!uuid.validate(yearId)) {
      throw new AppError('Invalid year ID', ERROR_CODES.VALIDATION_ERROR, 400);
    }

    const lockedYear = await lockYear(yearId);
    return c.json(lockedYear, 200);
  },
);

export default router;
