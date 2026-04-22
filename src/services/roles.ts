import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib/supabase.ts";
import { Role } from "@/types/role.ts";
import { AppError } from "@/utils/error.ts";
import {
  applyRoleSideEffects,
  getActiveYear,
  validateRoleTransition,
} from "@/utils/roles.ts";
import { getAllAppUsers } from "@/utils/users.ts";

export const getAppUsers = async ({ userRole }: { userRole: Role }) => {
  const db = getSupabase();

  const [allUsers, { data: usersRolesData, error: usersRolesError }] =
    await Promise.all([
      getAllAppUsers(true),
      db
        .from(Table.Profiles)
        .select("id, global_role")
        .in("global_role", [Role.Admin, Role.Viewer, Role.User]),
    ]);

  if (usersRolesError) {
    throw new AppError(
      "Failed to fetch all users",
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      500,
    );
  }

  if (!usersRolesData || allUsers.length === 0) {
    return [];
  }

  const usersMap = new Map(
    allUsers.map((user) => [
      user.id,
      {
        email: user.email ?? null,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      },
    ]),
  );

  const usersWithRoles = usersRolesData.map((user) => {
    const userData = usersMap.get(user.id);

    return {
      id: user.id,
      email: userData?.email ?? "",
      name: userData?.name ?? "",
      role: user.global_role,
    };
  });

  switch (userRole) {
    case Role.Admin:
      return usersWithRoles.filter(
        (user) => user.role !== Role.Admin && user.role !== Role.Superadmin,
      );
    case Role.Superadmin:
      return usersWithRoles.filter((user) => user.role !== Role.Superadmin);
    default:
      return [];
  }
};

export const updateUserRole = async ({
  currentRole,
  targetRole,
  profileId,
  userRole,
}: {
  currentRole: Role;
  targetRole: Role;
  profileId: string;
  userRole: Role;
}) => {
  const db = getSupabase();

  const { data: profile, error: profileError } = await db
    .from(Table.Profiles)
    .select("id, global_role")
    .eq("id", profileId)
    .maybeSingle();

  if (profileError) {
    throw new AppError(
      "Failed to fetch target user profile",
      ERROR_CODES.PROFILE_LOOKUP_FAILED,
      500,
    );
  }

  if (!profile) {
    throw new AppError(
      "Target user profile not found",
      ERROR_CODES.PROFILE_NOT_FOUND,
      404,
    );
  }

  if (profile.global_role !== currentRole) {
    throw new AppError(
      "Role is out of sync — the user's role has changed since you loaded this page",
      ERROR_CODES.ROLE_OUT_OF_SYNC,
      409,
    );
  }

  const transition = validateRoleTransition(userRole, currentRole, targetRole);
  const activeYear = await getActiveYear();

  await applyRoleSideEffects(profileId, transition, activeYear);

  const { data: updatedProfile, error: updateError } = await db
    .from(Table.Profiles)
    .update({ global_role: targetRole })
    .eq("id", profileId)
    .select("id, global_role")
    .single();

  if (updateError) {
    throw new AppError(
      "Failed to update user role",
      ERROR_CODES.ROLE_CHANGE_FAILED,
      500,
    );
  }

  return updatedProfile;
};
