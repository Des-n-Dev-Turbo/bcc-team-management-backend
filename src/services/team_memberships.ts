import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { Role } from "@/types";
import { AppError } from "@/utils/error.ts";
import { getRequesterTeam } from "@/utils/participants.ts";
import {
  getPromotionContext,
  validateParticipantForPromotion,
  validateTeamLeadConstraint,
  validateTeamMembership,
  validateTeamParticipants,
  validateYearAccess,
} from "@/utils/team_memberships.ts";
import { validateYear } from "@/utils/years.ts";

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

  const yearData = await validateYear({
    yearId,
    yearLockedErrorMessage: "Cannot add team member to a locked year",
  });

  const { data: yearParticipantData, error: yearParticipantError } = await db
    .from(Table.YearParticipants)
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
    .from(Table.Teams)
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
    const { actualTeamId: requesterTeamId } = await getRequesterTeam({
      userId,
      yearId,
      role,
      requestedTeamId: teamId,
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
    .from(Table.TeamMemberships)
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
    .from(Table.TeamMemberships)
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
    .from(Table.Teams)
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
    .from(Table.TeamMemberships)
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

export const promoteToTeamLead = async ({
  participantId,
  membershipId,
  yearId,
  teamId,
}: {
  participantId: string;
  membershipId: string;
  yearId: string;
  teamId: string;
}) => {
  const db = getSupabase();

  await validateYear({
    yearId,
    yearLockedErrorMessage:
      "Cannot promote a participant to a team lead in a locked year",
  });

  const promotionContext = await getPromotionContext({
    participantId,
    teamId,
    yearId,
  });

  validateParticipantForPromotion({
    participant: promotionContext.participant,
    profile: promotionContext.profile,
  });
  validateYearAccess({ participant: promotionContext.participant });
  validateTeamMembership({ participant: promotionContext.participant });
  validateTeamLeadConstraint({
    participantId: promotionContext.participant?.id ?? participantId,
    teamLead: promotionContext.teamLead,
  });

  const { data: teamLeadData, error: teamLeadError } = await db
    .from(Table.TeamMemberships)
    .update({ is_team_lead: true })
    .eq("id", membershipId)
    .eq("year_participant_id", participantId)
    .eq("team_id", teamId)
    .is("is_team_lead", false)
    .select("id, team_id, year_participant_id, is_team_lead")
    .single();

  if (teamLeadError) {
    throw new AppError(
      "Unable to update participant to team lead",
      ERROR_CODES.TEAM_MEMBERSHIP_UPDATE_FAILED,
      500,
    );
  }

  if (!teamLeadData) {
    throw new AppError(
      "The Team Membership is not available",
      ERROR_CODES.TEAM_MEMBERSHIP_NOT_FOUND,
      404,
    );
  }

  return teamLeadData;
};

export const demoteFromTeamLead = async ({
  membershipId,
  yearId,
  teamId,
}: {
  membershipId: string;
  yearId: string;
  teamId: string;
}) => {
  const { db, currentTeamId, isTeamLead } = await validateTeamParticipants({
    yearId,
    membershipId,
  });

  if (teamId !== currentTeamId) {
    throw new AppError(
      "There is a conflict between the team the participant belongs to",
      ERROR_CODES.INVALID_REQUEST,
      409,
    );
  }

  if (!isTeamLead) {
    throw new AppError(
      "The participant you are trying to demote is not a team lead",
      ERROR_CODES.NOT_A_TEAM_LEAD,
      400,
    );
  }

  const { data: teamMembershipUpdateData, error: teamMembershipUpdateError } =
    await db
      .from(Table.TeamMemberships)
      .update({ is_team_lead: false })
      .eq("id", membershipId)
      .eq("team_id", currentTeamId)
      .select("id, team_id, year_participant_id, is_team_lead")
      .single();

  if (teamMembershipUpdateError || !teamMembershipUpdateData) {
    throw new AppError(
      "Error updating team membership",
      ERROR_CODES.TEAM_MEMBERSHIP_UPDATE_FAILED,
      500,
    );
  }

  return teamMembershipUpdateData;
};
