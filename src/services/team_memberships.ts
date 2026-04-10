import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { Role } from "@/types";
import { AppError } from "@/utils/error.ts";
import { getRequesterTeam } from "@/utils/participants.ts";
import { validateTeamParticipants } from "@/utils/team_memberships.ts";

export const addParticipantToTeam = async ({
  yearId,
  teamId,
  participantId,
  userId,
  role,
}: {
  yearId: string;
  teamId: string;
  participantId: string;
  userId: string;
  role: Role;
}) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from("years")
    .select("id, is_locked")
    .eq("id", yearId)
    .maybeSingle();

  if (yearError) {
    throw new AppError(
      "Failed to fetch associated year",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!yearData) {
    throw new AppError(
      "Associated year not found",
      ERROR_CODES.YEAR_NOT_FOUND,
      404,
    );
  }

  if (yearData.is_locked) {
    throw new AppError(
      "Cannot add team member for a locked year",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: yearParticipantData, error: yearParticipantError } = await db
    .from("year_participants")
    .select("id, year_id, user_id")
    .eq("id", participantId)
    .eq("year_id", yearData.id)
    .or("banned.eq.false,banned.is.null")
    .maybeSingle();

  if (yearParticipantError) {
    throw new AppError(
      "Failed to fetch participant",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (!yearParticipantData) {
    throw new AppError(
      "Participant not registered in this year",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  const { data: teamData, error: teamError } = await db
    .from("teams")
    .select("id")
    .eq("id", teamId)
    .eq("year_id", yearData.id)
    .maybeSingle();

  if (teamError) {
    throw new AppError("Team Fetch Failed", ERROR_CODES.TEAM_FETCH_FAILED, 500);
  }

  if (!teamData) {
    throw new AppError(
      "Team not found, or doesn't exist for this year.",
      ERROR_CODES.TEAM_NOT_FOUND,
      404,
    );
  }

  if (role === Role.User) {
    const { teamId: requesterTeamId } = await getRequesterTeam({
      userId,
      yearId,
      role,
    });
    if (requesterTeamId !== teamId) {
      throw new AppError(
        "Team leads can only assign participants to their own team",
        ERROR_CODES.FORBIDDEN,
        403,
      );
    }
  }

  const { data: teamMembershipData, error: teamMembershipError } = await db
    .from("team_memberships")
    .insert({
      team_id: teamData.id,
      year_participant_id: yearParticipantData.id,
      is_team_lead: false,
    })
    .select("id, team_id, year_participant_id, is_team_lead")
    .single();

  if (teamMembershipError) {
    if (teamMembershipError.code === "23505") {
      throw new AppError(
        "The Participant is already assigned to this team for this year",
        ERROR_CODES.TEAM_MEMBERSHIP_ALREADY_EXISTS,
        409,
      );
    }

    throw new AppError(
      "Internal Server Error",
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      500,
    );
  }

  return teamMembershipData;
};

export const removeParticipantFromTeam = async ({
  yearId,
  membershipId,
}: {
  yearId: string;
  membershipId: string;
}) => {
  const { db } = await validateTeamParticipants({ yearId, membershipId });

  const { data: deletedData, error: deleteError } = await db
    .from("team_memberships")
    .delete()
    .eq("id", membershipId)
    .select()
    .single();

  if (deleteError) {
    throw new AppError(
      "Failed to remove participant from team",
      ERROR_CODES.TEAM_MEMBERSHIP_DELETE_FAILED,
      500,
    );
  }

  return deletedData;
};

export const transferParticipant = async ({
  teamId,
  toTeamId,
  membershipId,
  yearId,
}: {
  teamId: string;
  toTeamId: string;
  membershipId: string;
  yearId: string;
}) => {
  const {
    db,
    currentTeamId,
    yearId: currentYearId,
  } = await validateTeamParticipants({
    yearId,
    membershipId,
  });

  if (currentTeamId !== teamId) {
    throw new AppError(
      "Incorrect Participant Team Id given",
      ERROR_CODES.INVALID_REQUEST,
      400,
    );
  }

  const { data: toTeamData, error: toTeamError } = await db
    .from("teams")
    .select("id, name, year_id")
    .eq("id", toTeamId)
    .eq("year_id", currentYearId)
    .maybeSingle();

  if (toTeamError) {
    throw new AppError(
      "Team fetch failed",
      ERROR_CODES.TEAMS_FETCH_FAILED,
      500,
    );
  }

  if (!toTeamData) {
    throw new AppError(
      "The team you are trying to transfer the participant to does not exist",
      ERROR_CODES.TEAM_FETCH_FAILED,
      404,
    );
  }

  const { data: updatedData, error: updatedError } = await db
    .from("team_memberships")
    .update({ team_id: toTeamData.id, is_team_lead: false })
    .eq("id", membershipId)
    .select("id, team_id")
    .single();

  if (updatedError) {
    throw new AppError(
      "Failed to transfer participant from team",
      ERROR_CODES.TEAM_MEMBERSHIP_TRANSFER_FAILED,
      500,
    );
  }

  return { name: toTeamData.name, teamId: updatedData.team_id };
};
