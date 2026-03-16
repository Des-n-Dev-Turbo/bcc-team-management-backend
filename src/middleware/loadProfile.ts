import { Context, Next } from 'hono';
import { getSupabase } from '@/lib/supabase.ts';

export async function loadProfile(c: Context, next: Next) {
  const userId = c.get('userId');

  if (!userId) {
    return c.json({ error: 'Unauthenticated' }, 401);
  }

  const db = getSupabase();

  const { data, error } = await db
    .from('profiles')
    .select('id, global_role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error(error);
    return c.json({ error: 'Profile lookup failed' }, 500);
  }

  if (!data) {
    return c.json({ error: 'Profile not found' }, 403);
  }

  c.set('profile', data);

  await next();
}
