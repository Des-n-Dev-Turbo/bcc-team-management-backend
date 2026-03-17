import { Context, Next } from 'hono';
import { getSupabase } from '@/lib';
import type { AppContext } from '@/types';
import { ERROR_CODES } from '@/constants/error-codes.ts';
import { AppError } from '@/utils/error.ts';

export async function loadProfile(c: Context<AppContext>, next: Next) {
  const userId = c.get('userId');

  if (!userId) {
    throw new AppError('Unauthenticated', ERROR_CODES.UNAUTHORIZED, 401);
  }

  const db = getSupabase();

  const { data, error } = await db
    .from('profiles')
    .select('id, global_role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new AppError(
      'Profile lookup failed',
      ERROR_CODES.PROFILE_LOOKUP_FAILED ?? 'PROFILE_LOOKUP_FAILED',
      500,
    );
  }

  if (!data) {
    throw new AppError('Profile not found', ERROR_CODES.PROFILE_NOT_FOUND, 403);
  }

  c.set('profile', data);

  await next();
}
