import { getSupabase } from '@/lib/supabase.ts';
import { AppError } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

export const createYear = async ({
  name,
  year,
}: {
  name: string;
  year: number;
}) => {
  const db = getSupabase();

  const { data: newYear, error: insertError } = await db
    .from('years')
    .insert({
      name,
      year,
      is_locked: false,
    })
    .select('id, name, year, is_locked')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      throw new AppError(
        'Year already exists',
        ERROR_CODES.DUPLICATE_YEAR,
        409,
      );
    }

    throw new AppError(
      'Failed to create year',
      ERROR_CODES.CREATE_YEAR_FAILED,
      500,
    );
  }

  return newYear;
};

export const lockYear = async (year: string) => {
  const db = getSupabase();

  const { data: fetchYear, error: fetchError } = await db
    .from('years')
    .select('id, is_locked')
    .eq('id', year)
    .maybeSingle();

  if (fetchError) {
    throw new AppError(
      'Failed to fetch year',
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!fetchYear) {
    throw new AppError('Year not found', ERROR_CODES.YEAR_NOT_FOUND, 404);
  }

  if (fetchYear.is_locked) {
    throw new AppError(
      'Year is already locked',
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: lockedYear, error: lockedYearError } = await db
    .from('years')
    .update({ is_locked: true })
    .eq('id', year)
    .select('id, is_locked, name, year')
    .single();

  if (lockedYearError) {
    throw new AppError(
      'Failed to lock year',
      ERROR_CODES.LOCK_YEAR_FAILED,
      500,
    );
  }

  return lockedYear;
};
