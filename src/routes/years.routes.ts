import { Hono } from 'hono';

import { supabaseAuth, loadProfile, requireRole } from '@/middleware';
import { createYear, lockYear } from '@/services';
import { createYearSchema, lockYearSchema } from '@/schemas/years.schema.ts';

import { type AppContext, Role } from '@/types';
import { validate, getValidated } from '@/utils/validate.ts';

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

export default router;
