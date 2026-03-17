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
