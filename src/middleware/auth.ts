import { Context, Next } from 'hono';
import { verifySupabaseJWT } from '@/lib';

import { AppError } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

export async function supabaseAuth(c: Context, next: Next) {
  const auth = c.req.header('Authorization');

  if (!auth?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing token' }, 401);
  }

  const token = auth.slice(7);

  try {
    const payload = await verifySupabaseJWT(token);

    c.set('userId', payload.sub);

    await next();
  } catch (err) {
    console.error('JWT verify failed:', err);
    throw new AppError('Missing token', ERROR_CODES.UNAUTHORIZED, 401);
  }
}
