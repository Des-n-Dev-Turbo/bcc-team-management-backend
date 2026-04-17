import { PERMANENT_BAN_DURATION, Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { type ParticipantBanResult, Role } from "@/types";
import { AppError } from "./error.ts";

export const getRequesterTeam = async ({
  yearId,
  userId,
  role,
  requestedTeamId,
}: {
  yearId: string;
  userId: string;
  role: Role;
  requestedTeamId?: string;
}) => {
  if (role === Role.Admin || role === Role.Superadmin) {
    return { teamId: null, actualTeamId: null, canSeePII: true };
  }

  if (role === Role.Viewer) {
    return { teamId: null, actualTeamId: null, canSeePII: false };
  }

  if (role === Role.User) {
    const db = getSupabase();

    const { data, error } = await db
      .from(Table.YearParticipants)
      .select(`${Table.TeamMemberships}(team_id, is_team_lead)`)
      .eq("year_id", yearId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new AppError(
        "Unable to fetch team membership details",
        ERROR_CODES.TEAM_MEMBERSHIP_FETCH_FAILED,
        500,
      );
    }

    if (!data) {
      return { teamId: null, actualTeamId: null, canSeePII: false };
    }

    const membership = Array.isArray(data.team_memberships)
      ? data.team_memberships[0]
      : data.team_memberships;

    return {
      teamId: requestedTeamId ?? null,
      actualTeamId: membership?.team_id ?? null,
      canSeePII:
        requestedTeamId === membership?.team_id && !!membership?.is_team_lead,
    } as {
      teamId: string | null;
      actualTeamId: string | null;
      canSeePII: boolean;
    };
  }

  return { teamId: null, actualTeamId: null, canSeePII: false };
};

export const applyPrivacyMask = (
  data: Record<string, unknown>[],
  canSeePII: boolean,
) => {
  if (canSeePII) {
    return data;
  }

  return data.map((item) => {
    const maskedItem: Record<string, unknown> = { ...item };

    if ("email" in maskedItem) {
      maskedItem.email = null;
    }

    if ("mobile" in maskedItem) {
      maskedItem.mobile = null;
    }
    return maskedItem;
  });
};

export const banVolunteer = async ({
  participantId,
}: {
  participantId: string;
}): Promise<ParticipantBanResult> => {
  const db = getSupabase();

  const { error } = await db.rpc("ban_volunteer", {
    p_participant_id: participantId,
  });

  if (error) {
    throw new AppError(
      "Atomic DB update failed for volunteer ban",
      ERROR_CODES.PARTICIPANT_BAN_FAILED,
      500,
    );
  }

  // Fetch updated record for response
  const { data } = await db
    .from(Table.YearParticipants)
    .select("id, year_id, name, mobile, email, user_id, reg_id, banned")
    .eq("id", participantId)
    .single();

  return { success: true, db_updated: true, data, account_disabled: false };
};

export const banTeamLead = async ({
  participantId,
  yearId,
  userId,
}: {
  participantId: string;
  yearId: string;
  userId: string;
}): Promise<ParticipantBanResult> => {
  const db = getSupabase();

  const { error: authError } = await db.auth.admin.updateUserById(userId, {
    ban_duration: PERMANENT_BAN_DURATION,
  });

  if (authError) {
    throw new AppError(
      "Auth API failed",
      ERROR_CODES.TEAM_LEAD_BAN_FAILED,
      500,
    );
  }

  const { error: rpcError } = await db.rpc("ban_team_lead", {
    p_participant_id: participantId,
    p_user_id: userId,
    p_year_id: yearId,
  });

  if (rpcError) {
    return {
      success: false,
      account_disabled: true,
      db_updated: false,
      data: null,
    };
  }

  const { data } = await db
    .from(Table.YearParticipants)
    .select("id, year_id, name, mobile, email, user_id, reg_id, banned")
    .eq("id", participantId)
    .single();

  return { success: true, account_disabled: true, db_updated: true, data };
};
