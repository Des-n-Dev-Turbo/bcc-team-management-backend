import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib/supabase.ts";
import { Role } from "@/types/role.ts";
import { AppError } from "@/utils/error.ts";

export const bootstrapProfile = async ({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string | null;
  name: string | null;
}) => {
  const db = getSupabase();

  const { data: existingProfile, error: fetchError } = await db
    .from(Table.Profiles)
    .select("id, global_role")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new AppError(
      "Failed to fetch profile",
      ERROR_CODES.PROFILE_LOOKUP_FAILED,
      500,
    );
  }

  if (existingProfile) {
    await db.from(Table.Profiles).update({ name, email }).eq("id", userId);
    return existingProfile;
  }

  const { data: newProfile, error: insertError } = await db
    .from(Table.Profiles)
    .insert({
      id: userId,
      global_role: Role.Viewer,
      name,
      email,
    })
    .select("id, global_role")
    .single();

  if (insertError) {
    throw new AppError(
      "Failed to create profile",
      ERROR_CODES.PROFILE_CREATION_FAILED,
      500,
    );
  }

  return newProfile;
};
