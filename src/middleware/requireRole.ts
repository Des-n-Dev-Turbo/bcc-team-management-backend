import { Context, Next } from 'hono';
import { Role, hasRequiredRole } from '@/types/role.ts';

export function requireRole(requiredRole: Role) {
  return async (c: Context, next: Next) => {
    const profile = c.get('profile');

    if (!profile) {
      return c.json({ error: 'Profile not loaded' }, 500);
    }

    const userRole = profile.global_role as Role;

    if (!hasRequiredRole(userRole, requiredRole)) {
      return c.json({ error: 'Forbidden' }, 403);
    }

    await next();
  };
}
