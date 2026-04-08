import { getSupabase } from '@/lib';

import { AppError } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';
import { getRequesterTeam } from '@/utils/participants.ts';
import { Role } from '@/types';

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
      'Cannot create team for a locked year',
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: yearParticipantData, error: yearParticipantError } = await db
    .from('year_participants')
    .select('id, year_id, user_id')
    .eq('id', participantId)
    .eq('year_id', yearData.id)
    .or('banned.eq.false,banned.is.null')
    .maybeSingle();

  if (yearParticipantError) {
    throw new AppError(
      'Failed to fetch participant',
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (!yearParticipantData) {
    throw new AppError(
      'Participant not registered in this year',
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  const { data: teamData, error: teamError } = await db
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('year_id', yearData.id)
    .maybeSingle();

  if (teamError) {
    throw new AppError('Team Fetch Failed', ERROR_CODES.TEAM_FETCH_FAILED, 500);
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
        'Team leads can only assign participants to their own team',
        ERROR_CODES.FORBIDDEN,
        403,
      );
    }
  }

  const { data: teamMembershipData, error: teamMembershipError } = await db
    .from('team_memberships')
    .insert({
      team_id: teamData.id,
      year_participant_id: yearParticipantData.id,
      is_team_lead: false,
    })
    .select('id, team_id, year_participant_id, is_team_lead')
    .single();

  if (teamMembershipError) {
    if (teamMembershipError.code === '23505') {
      throw new AppError(
        'The Participant is already assigned to this team for this year',
        ERROR_CODES.TEAM_MEMBERSHIP_ALREADY_EXISTS,
        409,
      );
    }

    throw new AppError(
      'Internal Server Error',
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      500,
    );
  }

  return teamMembershipData;
};
