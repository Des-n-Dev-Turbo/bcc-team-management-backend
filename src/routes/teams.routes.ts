import { Hono } from 'hono';

import { supabaseAuth, loadProfile, requireRole } from '@/middleware';
import {
  createTeam,
  getTeamsByYear,
  updateTeamName,
  copyTeamsToYear,
} from '@/services';
import {
  createTeamSchema,
  getTeamsSchema,
  teamIdsParamsSchema,
  updateTeamNameParamsSchema,
  updateTeamNameSchema,
} from '@/schemas/teams.schema.ts';

import { validate, getValidated } from '@/utils/validate.ts';
import { type AppContext, Role } from '@/types';

const router = new Hono<AppContext>();

router.post(
  '/create',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate('json', createTeamSchema),
  async (c) => {
    const body = getValidated(c, 'json', createTeamSchema);

    const { name, yearId } = body;

    const newTeam = await createTeam(name, yearId);
    return c.json(newTeam, 201);
  },
);

router.get(
  '/',
  supabaseAuth,
  loadProfile,
  validate('query', getTeamsSchema),
  async (c) => {
    const { yearId } = getValidated(c, 'query', getTeamsSchema);

    const teams = await getTeamsByYear(yearId);

    return c.json(teams, 200);
  },
);

router.patch(
  '/:teamId',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate('param', updateTeamNameParamsSchema),
  validate('json', updateTeamNameSchema),
  async (c) => {
    const teamId = getValidated(c, 'param', updateTeamNameParamsSchema).teamId;

    const { name: newName } = getValidated(c, 'json', updateTeamNameSchema);

    const updatedTeam = await updateTeamName(teamId, newName);
    return c.json(updatedTeam, 200);
  },
);

router.post(
  '/year/:yearId/copy',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate('param', getTeamsSchema),
  validate('json', teamIdsParamsSchema),
  async (c) => {
    const { yearId } = getValidated(c, 'param', getTeamsSchema);

    const { teamIds } = getValidated(c, 'json', teamIdsParamsSchema);

    const copiedTeams = await copyTeamsToYear({ yearId, teamIds });

    return c.json(copiedTeams, 200);
  },
);

export default router;
