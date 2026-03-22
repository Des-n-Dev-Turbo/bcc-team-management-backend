import type { MiddlewareHandler, Next } from 'hono';

import { uuidSchema } from '@/schemas/common.schema.ts';
import { getSupabase } from '@/lib/supabase.ts';
import { AppError } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

import {
  hasRequiredRole,
  Role,
  type AppContext,
  YearAccessStatus,
} from '@/types';

export const requireYearAccess: MiddlewareHandler<AppContext> = async (
  c,
  next: Next,
) => {
  const profile = c.get('profile');

  if (hasRequiredRole(profile.global_role, Role.Admin)) {
    await next();
    return;
  }

  const yearId = c.req.query('yearId');

  if (!yearId) {
    throw new AppError(
      'Year ID is required',
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  const validYearId = uuidSchema.safeParse(yearId);

  if (!validYearId.success) {
    throw new AppError(
      'Invalid year ID format',
      ERROR_CODES.VALIDATION_ERROR,
      400,
    );
  }

  const db = getSupabase();

  const { data: yearAccessData, error: yearAccessError } = await db
    .from('year_access')
    .select()
    .eq('user_id', profile.id)
    .eq('year_id', yearId)
    .eq('status', YearAccessStatus.APPROVED)
    .maybeSingle();

  if (yearAccessError) {
    throw new AppError(
      'Failed to check year access',
      ERROR_CODES.YEAR_ACCESS_CHECK_FAILED,
      500,
    );
  }

  if (!yearAccessData) {
    throw new AppError(
      'Forbidden: You do not have access to this year',
      ERROR_CODES.FORBIDDEN,
      403,
    );
  }

  await next();
};
