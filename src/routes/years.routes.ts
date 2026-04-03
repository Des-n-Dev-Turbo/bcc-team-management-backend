import { Hono } from 'hono';

import { supabaseAuth, loadProfile, requireRole } from '@/middleware';
import {
  createYear,
  getYears,
  lockYear,
  getTeamLeadsForYear,
} from '@/services';
import { createYearSchema, lockYearSchema } from '@/schemas/years.schema.ts';
import { yearParticipantsParamsSchema } from '@/schemas/year_participants.schema.ts';
import yearsParticipantRouter from './year_participants.routes.ts';
import teamParticipantsRouter from './team_participants.routes.ts';

import { validate, getValidated } from '@/utils/validate.ts';
import { type AppContext, Role } from '@/types';

const router = new Hono<AppContext>();

router.post(
  '/',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Superadmin),
  validate('json', createYearSchema),
  async (c) => {
    const { name, year } = getValidated(c, 'json', createYearSchema);

    const newYear = await createYear({ name, year });
    return c.json(newYear, 201);
  },
);

router.post(
  '/:yearId/lock',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate('param', lockYearSchema),
  async (c) => {
    const { yearId } = getValidated(c, 'param', lockYearSchema);
    const lockedYear = await lockYear(yearId);
    return c.json(lockedYear, 200);
  },
);

router.get('/', supabaseAuth, loadProfile, async (c) => {
  const userId = c.get('userId');

  const profile = c.get('profile');

  const years = await getYears({ userId, role: profile.global_role });

  return c.json(years, 200);
});

router.get(
  '/:yearId/team-leads',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate('param', yearParticipantsParamsSchema),
  async (c) => {
    const { yearId } = getValidated(c, 'param', yearParticipantsParamsSchema);

    const result = await getTeamLeadsForYear(yearId);

    return c.json(result, 200);
  },
);

router.route('/:yearId/participants', yearsParticipantRouter);

router.route('/:yearId/teams', teamParticipantsRouter);

export default router;
