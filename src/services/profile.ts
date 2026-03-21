import { getSupabase } from '@/lib/supabase.ts';
import { Role } from '@/types/role.ts';
import { AppError } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

export const bootstrapProfile = async (userId: string) => {
  const db = getSupabase();

  const { data: existingProfile, error: fetchError } = await db
    .from('profiles')
    .select('id, global_role')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    throw new AppError(
      'Failed to fetch profile',
      ERROR_CODES.PROFILE_LOOKUP_FAILED,
      500,
    );
  }

  if (existingProfile) {
    return existingProfile;
  }

  const { data: newProfile, error: insertError } = await db
    .from('profiles')
    .insert({
      id: userId,
      global_role: Role.Viewer,
    })
    .select('id, global_role')
    .single();

  if (insertError) {
    throw new AppError(
      'Failed to create profile',
      ERROR_CODES.PROFILE_CREATION_FAILED,
      500,
    );
  }

  return newProfile;
};
