import { getSupabase } from '@/lib/supabase.ts';
import { Role } from '@/types/role.ts';

export const bootstrapProfile = async (userId: string) => {
  const db = getSupabase();

  const { data: existingProfile, error: fetchError } = await db
    .from('profiles')
    .select('id, global_role')
    .eq('id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('Error fetching profile:', fetchError);
    throw new Error('Failed to fetch profile');
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
    console.error('Error creating profile:', insertError);
    throw new Error('Failed to create profile');
  }

  return newProfile;
};
