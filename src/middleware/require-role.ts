import { Context, Next } from 'hono';
import { Role, hasRequiredRole } from '@/types';
import { ERROR_CODES } from '@/constants/error-codes.ts';
import { AppError } from '@/utils/error.ts';

export function requireRole(requiredRole: Role) {
  return async (c: Context, next: Next) => {
    const profile = c.get('profile');

    if (!profile) {
      throw new AppError(
        'Profile not loaded',
        ERROR_CODES.PROFILE_NOT_FOUND,
        500,
      );
    }

    const userRole = profile.global_role as Role;

    if (!hasRequiredRole(userRole, requiredRole)) {
      throw new AppError('Forbidden', ERROR_CODES.FORBIDDEN, 403);
    }

    await next();
  };
}
