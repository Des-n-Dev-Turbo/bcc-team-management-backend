import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import type { Role } from "@/types";
import { AppError } from "@/utils/error.ts";
import { applyPrivacyMask, getRequesterTeam } from "@/utils/participants.ts";

export const getTeamYearParticipants = async ({
  yearId,
  teamId,
  userId,
  role,
}: {
  yearId: string;
  teamId: string;
  userId: string;
  role: Role;
}) => {
  const db = getSupabase();

  const { data: teamData } = await db
    .from(Table.Teams)
    .select("id")
    .eq("id", teamId)
    .eq("year_id", yearId)
    .maybeSingle();

  if (!teamData) {
    throw new AppError("Team not found", ERROR_CODES.TEAM_NOT_FOUND, 404);
  }

  const { canSeePII } = await getRequesterTeam({
    yearId,
    userId,
    role,
    requestedTeamId: teamId,
  });

  const { data: participantsData, error: participantsError } = await db
    .from(Table.YearParticipants)
    .select(
      `id, name, email, mobile, reg_id, banned, disqualified, ${Table.TeamMemberships}!inner(id, team_id, is_team_lead)`,
    )
    .eq(`${Table.TeamMemberships}.team_id`, teamData.id)
    .eq("year_id", yearId)
    .or("banned.eq.false,banned.is.null")
    .is("user_id", null)
    .order("name", { ascending: true })
    .limit(50);

  if (participantsError) {
    throw new AppError(
      "Failed to fetch team participants",
      ERROR_CODES.TEAM_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (!participantsData || participantsData.length === 0) {
    return [];
  }

  const teamParticipantsData = (participantsData || []).map(
    (item: {
      id: string;
      name: string;
      email: string;
      mobile: string;
      reg_id: string;
      banned: boolean;
      disqualified: boolean;
      team_memberships: {
        id: string;
        team_id: string;
        is_team_lead: boolean;
      }[];
    }) => ({
      id: item.id,
      name: item.name,
      email: item.email,
      mobile: item.mobile,
      reg_id: item.reg_id,
      banned: item.banned,
      disqualified: item.disqualified,
      team_membership_id: item.team_memberships[0]?.id ?? null,
      team_id: item.team_memberships[0]?.team_id ?? null,
      is_team_lead: item.team_memberships[0]?.is_team_lead ?? false,
    }),
  );

  const maskedParticipants = applyPrivacyMask(teamParticipantsData, canSeePII);

  return maskedParticipants;
};
