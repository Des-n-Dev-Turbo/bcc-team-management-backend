import { Hono } from 'hono';

import { supabaseAuth, loadProfile } from '@/middleware';
import { bootstrapProfile } from '@/services';

import type { AppContext } from '@/types';

const router = new Hono<AppContext>();

router.post('/bootstrap', supabaseAuth, async (c) => {
  const userId = c.get('userId');

  if (!userId) {
    return c.json({ error: 'Unauthenticated' }, 401);
  }

  try {
    const profile = await bootstrapProfile(userId);
    return c.json(profile);
  } catch (error) {
    console.error('Error enrolling profile:', error);
    return c.json({ error: 'Failed to enroll profile' }, 500);
  }
});

router.get('/me', supabaseAuth, loadProfile, async (c) => {
  const profile = c.get('profile');

  if (!profile) {
    return c.json({ error: 'Profile not found' }, 404);
  }

  return c.json(profile, 200);
});

export default router;
