import { Hono } from 'hono';
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from '@/middleware';
import { AppContext, Role } from '@/types';
import { validate, getValidated } from '@/utils/validate.ts';
import {
  addParticipantToTeamQuerySchema,
  addParticipantToTeamSchema,
} from '@/schemas/team_memberships.schema.ts';
import { addParticipantToTeam } from '@/services';

const router = new Hono<AppContext>();

router.post(
  '/',
  supabaseAuth,
  loadProfile,
  requireRole(Role.User),
  requireYearAccess,
  validate('json', addParticipantToTeamSchema),
  validate('query', addParticipantToTeamQuerySchema),
  async (c) => {
    const body = getValidated(c, 'json', addParticipantToTeamSchema);

    const { yearId } = getValidated(
      c,
      'query',
      addParticipantToTeamQuerySchema,
    );

    const { id: userId, global_role: role } = c.get('profile');

    const result = await addParticipantToTeam({
      ...body,
      yearId,
      userId,
      role,
    });

    return c.json(result, 201);
  },
);
