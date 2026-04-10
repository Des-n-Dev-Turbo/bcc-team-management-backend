import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { type PromotionContext, YearAccessStatus } from "@/types";
import { AppError } from "./error.ts";

export const validateTeamParticipants = async ({
  yearId,
  membershipId,
}: {
  yearId: string;
  membershipId: string;
}) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from(Table.Years)
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
      "Cannot remove/transfer team member for a locked year",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: teamMembershipData, error: teamMembershipError } = await db
    .from(Table.TeamMemberships)
    .select(
      `id, team_id, ${Table.YearParticipants}!inner(id, year_id), ${Table.Teams}!inner(id, year_id)`,
    )
    .eq("id", membershipId)
    .maybeSingle();

  if (teamMembershipError) {
    throw new AppError(
      "Team Membership Fetch Fail",
      ERROR_CODES.TEAM_MEMBERSHIP_FETCH_FAILED,
      500,
    );
  }

  if (!teamMembershipData) {
    throw new AppError(
      "Team Membership not found",
      ERROR_CODES.TEAM_MEMBERSHIP_NOT_FOUND,
      404,
    );
  }

  interface MembershipValidation {
    id: string;
    year_participants: { id: string; year_id: string };
    teams: { id: string; year_id: string };
  }

  // Then use a single cast:
  const membership = teamMembershipData as unknown as MembershipValidation;

  if (
    membership?.year_participants?.year_id !== yearId ||
    membership?.teams?.year_id !== yearId
  ) {
    throw new AppError(
      "The team participant doesn't belong to team from this year",
      ERROR_CODES.TEAM_MEMBERSHIP_INVALID,
      409,
    );
  }

  return {
    currentTeamId: membership?.teams.id,
    yearId: membership?.year_participants.year_id,
    db,
  };
};

export const getPromotionContext = async ({
  participantId,
  teamId,
  yearId,
}: {
  participantId: string;
  teamId: string;
  yearId: string;
}): Promise<PromotionContext> => {
  const db = getSupabase();

  const [participantValid, teamLeadExists] = await Promise.all([
    db
      .from(Table.YearParticipants)
      .select(
        `id, banned, name, email, user_id, ${Table.YearAccess}(id, status), ${Table.TeamMemberships}(id, is_team_lead)`,
      )
      .eq("id", participantId)
      .eq(`${Table.YearAccess}.year_id`, yearId)
      .eq(`${Table.YearAccess}.status`, YearAccessStatus.APPROVED)
      .eq(`${Table.TeamMemberships}.team_id`, teamId)
      .maybeSingle(),

    db
      .from(Table.TeamMemberships)
      .select("id, year_participant_id, is_team_lead")
      .eq("team_id", teamId)
      .eq("is_team_lead", true)
      .maybeSingle(),
  ]);

  if (participantValid.error) {
    throw new AppError(
      "Failed to fetch participant",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (teamLeadExists.error) {
    throw new AppError(
      "Failed to fetch team memberships",
      ERROR_CODES.TEAM_MEMBERSHIP_FETCH_FAILED,
      500,
    );
  }

  return {
    participant: participantValid.data,
    teamLead: teamLeadExists.data,
  };
};
