import { Context, Next } from 'hono';
import { verifySupabaseJWT } from '@/lib';

import { AppError, getErrorMessage } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

export async function supabaseAuth(c: Context, next: Next) {
  const auth = c.req.header('Authorization');

  if (!auth?.startsWith('Bearer ')) {
    throw new AppError('Missing token', ERROR_CODES.UNAUTHORIZED, 401);
  }

  const token = auth.slice(7);

  try {
    const payload = await verifySupabaseJWT(token);

    c.set('userId', payload.sub);

    await next();
  } catch (err) {
    console.error('JWT verify failed:', getErrorMessage(err));
    throw new AppError(
      'Invalid or expired token',
      ERROR_CODES.UNAUTHORIZED,
      401,
    );
  }
}
