import { Hono } from 'hono';
import * as uuid from 'jsr:@std/uuid';

import { supabaseAuth, loadProfile, requireRole } from '@/middleware';
import { AppError } from '@/utils/error.ts';
import { createTeam, getTeamsByYear, updateTeamName } from '@/services';

import { ERROR_CODES } from '@/constants/error-codes.ts';
import { type AppContext, Role } from '@/types';

const router = new Hono<AppContext>();

router.post(
  '/create',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  async (c) => {
    let body;
    try {
      body = await c.req.json();
    } catch (error) {
      throw new AppError(
        'Invalid JSON body',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const { name, yearId } = body;

    if (typeof name !== 'string' || !name.trim()) {
      throw new AppError(
        'Team name must be a non-empty string',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    if (typeof yearId !== 'string' || !yearId.trim()) {
      throw new AppError(
        'Year ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    if (!uuid.validate(yearId)) {
      throw new AppError(
        'Invalid year ID format',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const newTeam = await createTeam(name.trim(), yearId);
    return c.json(newTeam, 201);
  },
);

router.get('/', supabaseAuth, loadProfile, async (c) => {
  const yearId = c.req.query('yearId');

  if (typeof yearId !== 'string' || !yearId.trim()) {
    throw new AppError(
      'Year ID is required',
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  if (!uuid.validate(yearId)) {
    throw new AppError(
      'Invalid year ID format',
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  const teams = await getTeamsByYear(yearId.trim());

  return c.json(teams, 200);
});

router.patch(
  '/:teamId',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  async (c) => {
    const teamId = c.req.param('teamId');

    const cleanTeamId = teamId.trim();

    if (!cleanTeamId) {
      throw new AppError(
        'Team ID is required',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    if (!uuid.validate(cleanTeamId)) {
      throw new AppError(
        'Invalid team ID format',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    let body;
    try {
      body = await c.req.json();
    } catch (_error) {
      throw new AppError(
        'Invalid JSON body',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const { name: newName } = body;

    if (typeof newName !== 'string') {
      throw new AppError(
        'New team name must be a string',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const cleanName = newName.trim();

    if (!cleanName) {
      throw new AppError(
        'New team name must be a non-empty string',
        ERROR_CODES.VALIDATION_ERROR,
        400,
      );
    }

    const updatedTeam = await updateTeamName(cleanTeamId, cleanName);
    return c.json(updatedTeam, 200);
  },
);

export default router;
