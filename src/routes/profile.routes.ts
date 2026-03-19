import { Hono } from 'hono';

import { supabaseAuth, loadProfile } from '@/middleware';
import { bootstrapProfile } from '@/services';

import type { AppContext } from '@/types';

const router = new Hono<AppContext>();

router.post('/bootstrap', supabaseAuth, async (c) => {
  const userId = c.get('userId');

  const profile = await bootstrapProfile(userId);
  return c.json(profile);
});

router.get('/me', supabaseAuth, loadProfile, async (c) => {
  const profile = c.get('profile');

  return c.json(profile, 200);
});

export default router;
