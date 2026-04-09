import { getSupabase } from '@/lib';

import { AppError } from './error.ts';

import { ERROR_CODES } from '@/constants/error-codes.ts';

export const validateTeamParticipants = async ({
  yearId,
  membershipId,
}: {
  yearId: string;
  membershipId: string;
}) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from('years')
    .select('id, is_locked')
    .eq('id', yearId)
    .maybeSingle();

  if (yearError) {
    throw new AppError(
      'Failed to fetch associated year',
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!yearData) {
    throw new AppError(
      'Associated year not found',
      ERROR_CODES.YEAR_NOT_FOUND,
      404,
    );
  }

  if (yearData.is_locked) {
    throw new AppError(
      'Cannot remove/transfer team member for a locked year',
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: teamMembershipData, error: teamMembershipError } = await db
    .from('team_memberships')
    .select(
      'id, team_id, year_participants!inner(id, year_id), teams!inner(id, year_id)',
    )
    .eq('id', membershipId)
    .maybeSingle();

  if (teamMembershipError) {
    throw new AppError(
      'Team Membership Fetch Fail',
      ERROR_CODES.TEAM_MEMBERSHIP_FETCH_FAILED,
      500,
    );
  }

  if (!teamMembershipData) {
    throw new AppError(
      'Team Membership not found',
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
