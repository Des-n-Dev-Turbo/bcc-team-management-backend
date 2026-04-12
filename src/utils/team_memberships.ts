import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import {
  type PromotionContext,
  type PromotionParticipant,
  Role,
  YearAccessStatus,
} from "@/types";
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
      `id, team_id, is_team_lead, ${Table.YearParticipants}!inner(id, year_id), ${Table.Teams}!inner(id, year_id)`,
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
    is_team_lead: boolean | null;
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
    isTeamLead: membership?.is_team_lead,
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

  let profile = null;

  if (participantValid.data?.user_id) {
    const { data: profileData, error: profileError } = await db
      .from(Table.Profiles)
      .select("id, global_role")
      .eq("id", participantValid.data.user_id)
      .maybeSingle();

    if (profileError) {
      throw new AppError(
        "Profile fetch failed",
        ERROR_CODES.PROFILE_LOOKUP_FAILED,
        500,
      );
    }

    if (profileData) {
      profile = profileData;
    }
  }

  return {
    participant: participantValid.data,
    teamLead: teamLeadExists.data,
    profile,
  };
};

export const validateParticipantForPromotion = ({
  participant,
  profile,
}: {
  participant: PromotionParticipant | null;
  profile: PromotionContext["profile"];
}) => {
  if (!participant) {
    throw new AppError(
      "Participant not found",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  if (participant.banned) {
    throw new AppError(
      "Participant banned",
      ERROR_CODES.PARTICIPANT_BANNED,
      409,
    );
  }

  if (!participant.user_id || !profile) {
    throw new AppError(
      "Participant doesn't have an account yet",
      ERROR_CODES.USER_NOT_REGISTERED,
      400,
    );
  }

  if (profile.global_role !== Role.User) {
    throw new AppError(
      "Participant must have user role to be promoted to team lead",
      ERROR_CODES.NOT_A_TEAM_LEAD,
      403,
    );
  }

  return true;
};

export const validateYearAccess = ({
  participant,
}: {
  participant: PromotionParticipant | null;
}) => {
  if (!participant) {
    throw new AppError(
      "Participant not found",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  if (!participant.year_access.length) {
    throw new AppError(
      "The participant doesn't have access to this year",
      ERROR_CODES.YEAR_ACCESS_NOT_APPROVED,
      403,
    );
  }

  return true;
};

export const validateTeamMembership = ({
  participant,
}: {
  participant: PromotionParticipant | null;
}) => {
  if (!participant) {
    throw new AppError(
      "Participant not found",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  if (!participant.team_memberships.length) {
    throw new AppError(
      "Participant not in the team",
      ERROR_CODES.TEAM_MEMBERSHIP_NOT_FOUND,
      404,
    );
  }

  return true;
};

export const validateTeamLeadConstraint = ({
  teamLead,
  participantId,
}: {
  teamLead: PromotionContext["teamLead"];
  participantId: string;
}) => {
  if (
    teamLead &&
    teamLead.id &&
    teamLead.year_participant_id !== participantId
  ) {
    throw new AppError(
      "Team Lead already exists for this team",
      ERROR_CODES.TEAM_LEAD_ALREADY_EXISTS,
      409,
    );
  }

  return true;
};
