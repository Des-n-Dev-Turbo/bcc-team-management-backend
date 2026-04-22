import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { Role, YearAccessStatus } from "@/types";
import { AppError } from "./error.ts";

export type RoleTransition =
  | "viewer->user"
  | "user->viewer"
  | "viewer->admin"
  | "admin->viewer"
  | "user->admin"
  | "admin->user";

export type ActiveYear = { id: string } | null;

export const getActiveYear = async (): Promise<ActiveYear> => {
  const db = getSupabase();

  const { data, error } = await db
    .from(Table.Years)
    .select("id")
    .or("is_locked.is.null,is_locked.eq.false")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError(
      "Failed to fetch active year",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  return data ?? null;
};

const VALID_TRANSITIONS = new Set<RoleTransition>([
  "viewer->user",
  "user->viewer",
  "viewer->admin",
  "admin->viewer",
  "user->admin",
  "admin->user",
]);

const SUPERADMIN_ONLY_TRANSITIONS = new Set<RoleTransition>([
  "viewer->admin",
  "admin->viewer",
  "user->admin",
  "admin->user",
]);

export const validateRoleTransition = (
  actorRole: Role,
  currentRole: Role,
  targetRole: Role,
): RoleTransition => {
  if (currentRole === targetRole) {
    throw new AppError(
      "currentRole and targetRole are the same",
      ERROR_CODES.INVALID_ROLE_TRANSITION,
      400,
    );
  }

  const transition = `${currentRole}->${targetRole}` as RoleTransition;

  if (!VALID_TRANSITIONS.has(transition)) {
    throw new AppError(
      `Invalid role transition: ${transition}`,
      ERROR_CODES.INVALID_ROLE_TRANSITION,
      400,
    );
  }

  if (actorRole === Role.Admin && SUPERADMIN_ONLY_TRANSITIONS.has(transition)) {
    throw new AppError(
      "Admins cannot perform transitions involving the admin role",
      ERROR_CODES.FORBIDDEN,
      403,
    );
  }

  return transition;
};

export const applyRoleSideEffects = async (
  userId: string,
  transition: RoleTransition,
  activeYear: ActiveYear,
): Promise<void> => {
  const db = getSupabase();

  switch (transition) {
    case "viewer->user": {
      if (!activeYear) break;

      const { data: yearAccess, error: yaError } = await db
        .from(Table.YearAccess)
        .select("id")
        .eq("user_id", userId)
        .eq("year_id", activeYear.id)
        .eq("status", YearAccessStatus.APPROVED)
        .maybeSingle();

      if (yaError) {
        throw new AppError(
          "Failed to check year access",
          ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
          500,
        );
      }

      if (!yearAccess) break;

      const { data: profile, error: profileError } = await db
        .from(Table.Profiles)
        .select("id, name, email")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profile) {
        throw new AppError(
          "Failed to fetch profile for year participant creation",
          ERROR_CODES.PROFILE_LOOKUP_FAILED,
          500,
        );
      }

      const { error: insertError } = await db
        .from(Table.YearParticipants)
        .insert({
          year_id: activeYear.id,
          user_id: userId,
          name: profile.name ?? "",
          email: profile.email ?? "",
          mobile: null,
          banned: false,
          disqualified: false,
        });

      if (insertError && insertError.code !== "23505") {
        throw new AppError(
          "Failed to create year participant",
          ERROR_CODES.YEAR_PARTICIPANT_CREATION_FAILED,
          500,
          {
            yearAccessCreation: false,
            yearParticipantCreation: true,
          },
        );
      }
      break;
    }

    case "user->viewer":
    case "user->admin": {
      if (!activeYear) break;

      const { data: participant, error: participantError } = await db
        .from(Table.YearParticipants)
        .select(`id, ${Table.TeamMemberships}(id)`)
        .eq("user_id", userId)
        .eq("year_id", activeYear.id)
        .maybeSingle();

      if (participantError) {
        throw new AppError(
          "Failed to fetch year participant",
          ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
          500,
        );
      }

      if (!participant) break;

      const p = participant as unknown as {
        id: string;
        team_memberships: { id: string }[];
      };

      if (p.team_memberships?.[0]?.id) {
        const { error: membershipError } = await db
          .from(Table.TeamMemberships)
          .delete()
          .eq("id", p.team_memberships[0].id);

        if (membershipError) {
          throw new AppError(
            "Failed to delete team membership",
            ERROR_CODES.TEAM_MEMBERSHIP_UPDATE_FAILED,
            500,
          );
        }
      }

      const { error: deleteError } = await db
        .from(Table.YearParticipants)
        .delete()
        .eq("id", p.id);

      if (deleteError) {
        throw new AppError(
          "Failed to delete year participant",
          ERROR_CODES.YEAR_PARTICIPANT_DELETION_FAILED,
          500,
        );
      }
      break;
    }

    case "viewer->admin": {
      if (!activeYear) break;

      const { error } = await db
        .from(Table.YearAccess)
        .delete()
        .eq("user_id", userId)
        .eq("year_id", activeYear.id);

      if (error) {
        throw new AppError(
          "Failed to remove year access",
          ERROR_CODES.YEAR_ACCESS_REQUEST_REJECT_FAILED,
          500,
        );
      }
      break;
    }

    case "admin->viewer": {
      if (!activeYear) break;

      const { data: existing, error: fetchError } = await db
        .from(Table.YearAccess)
        .select("id, status")
        .eq("user_id", userId)
        .eq("year_id", activeYear.id)
        .eq("status", YearAccessStatus.APPROVED)
        .maybeSingle();

      if (fetchError) {
        throw new AppError(
          "Failed to check year access",
          ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
          500,
        );
      }

      if (existing) break;

      const { error: insertError } = await db.from(Table.YearAccess).insert({
        user_id: userId,
        year_id: activeYear.id,
        status: YearAccessStatus.APPROVED,
      });

      if (insertError) {
        throw new AppError(
          "Failed to create year access",
          ERROR_CODES.YEAR_ACCESS_REQUEST_FAILED,
          500,
        );
      }
      break;
    }

    case "admin->user": {
      if (!activeYear) break;

      const { data: existingAccess, error: fetchAccessError } = await db
        .from(Table.YearAccess)
        .select("id")
        .eq("user_id", userId)
        .eq("year_id", activeYear.id)
        .eq("status", YearAccessStatus.APPROVED)
        .maybeSingle();

      if (fetchAccessError) {
        throw new AppError(
          "Failed to check year access",
          ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
          500,
        );
      }

      if (!existingAccess) {
        const { error: yearAccessInsertError } = await db
          .from(Table.YearAccess)
          .insert({
            user_id: userId,
            year_id: activeYear.id,
            status: YearAccessStatus.APPROVED,
          });

        if (yearAccessInsertError) {
          throw new AppError(
            "Failed to create year access",
            ERROR_CODES.YEAR_ACCESS_REQUEST_FAILED,
            500,
          );
        }
      }

      const { data: profile, error: profileError } = await db
        .from(Table.Profiles)
        .select("id, name, email")
        .eq("id", userId)
        .maybeSingle();

      if (profileError || !profile) {
        throw new AppError(
          "Failed to fetch profile for year participant creation",
          ERROR_CODES.PROFILE_LOOKUP_FAILED,
          500,
        );
      }

      const { error: insertError } = await db
        .from(Table.YearParticipants)
        .insert({
          year_id: activeYear.id,
          user_id: userId,
          name: profile.name ?? "",
          email: profile.email ?? "",
          mobile: null,
          banned: false,
          disqualified: false,
        });

      if (insertError && insertError.code !== "23505") {
        throw new AppError(
          "Failed to create year participant",
          ERROR_CODES.YEAR_PARTICIPANT_CREATION_FAILED,
          500,
          {
            yearAccessCreation: true,
            yearParticipantCreation: false,
          },
        );
      }
      break;
    }
  }
};
