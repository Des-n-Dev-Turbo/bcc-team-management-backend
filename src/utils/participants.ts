import { getSupabase } from '@/lib';

import { AppError } from './error.ts';

import { ERROR_CODES } from '@/constants/error-codes.ts';
import { Role } from '@/types';

export const getRequesterTeam = async ({
  yearId,
  userId,
  role,
}: {
  yearId: string;
  userId: string;
  role: Role;
}) => {
  if (role === Role.Admin || role === Role.Superadmin) {
    return { teamId: null, canSeePII: true };
  }

  if (role === Role.Viewer) {
    return { teamId: null, canSeePII: false };
  }

  if (role === Role.User) {
    const db = getSupabase();

    const { data, error } = await db
      .from('year_participants')
      .select('team_memberships(team_id, is_team_lead)')
      .eq('year_id', yearId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new AppError(
        'Unable to fetch team membership details',
        ERROR_CODES.TEAM_MEMBERSHIP_FETCH_FAILED,
        500,
      );
    }

    if (!data) {
      return { teamId: null, canSeePII: false };
    }

    const membership = Array.isArray(data.team_memberships)
      ? data.team_memberships[0]
      : data.team_memberships;

    return {
      teamId: membership?.team_id ?? null,
      canSeePII: !!membership?.is_team_lead,
    } as { teamId: string | null; canSeePII: boolean };
  }

  return { teamId: null, canSeePII: false };
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

    if ('email' in maskedItem) {
      maskedItem.email = null;
    }

    if ('mobile' in maskedItem) {
      maskedItem.mobile = null;
    }
    return maskedItem;
  });
};
