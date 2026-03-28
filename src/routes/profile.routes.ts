import { Hono } from 'hono';

import { supabaseAuth, loadProfile } from '@/middleware';
import { bootstrapProfile } from '@/services';

import type { AppContext } from '@/types';

const router = new Hono<AppContext>();

router.post('/bootstrap', supabaseAuth, async (c) => {
  const userId = c.get('userId');

  const name = c.get('name');
  const email = c.get('email');

  const profile = await bootstrapProfile({ userId, name, email });
  return c.json(profile);
});

router.get('/me', supabaseAuth, loadProfile, async (c) => {
  const profile = c.get('profile');
  const name = c.get('name');
  const email = c.get('email');

  return c.json({ ...profile, name, email }, 200);
});

export default router;
