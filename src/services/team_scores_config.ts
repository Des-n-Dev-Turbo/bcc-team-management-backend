import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { AppError } from "@/utils/error.ts";
import { validateYear } from "@/utils/years.ts";

interface MedalValues {
  gold: number;
  silver: number;
  bronze: number;
  bonus: number;
}

export const setTeamScoresConfig = async ({
  teamId,
  yearId,
  values,
}: {
  teamId: string;
  yearId: string;
  values: MedalValues;
}) => {
  const db = getSupabase();

  await validateYear({
    yearId,
    yearLockedErrorMessage: "Cannot set scores config for a locked year",
  });

  const { data: teamData, error: teamError } = await db
    .from(Table.Teams)
    .select("id, year_id, gold, silver, bronze, bonus")
    .eq("id", teamId)
    .eq("year_id", yearId)
    .maybeSingle();

  if (teamError) {
    throw new AppError(
      "Failed to fetch team",
      ERROR_CODES.TEAM_FETCH_FAILED,
      500,
    );
  }

  if (!teamData) {
    throw new AppError(
      "Team not found for the specified year",
      ERROR_CODES.TEAM_NOT_FOUND,
      404,
    );
  }

  const alreadySet =
    teamData.gold !== null &&
    teamData.silver !== null &&
    teamData.bronze !== null &&
    teamData.bonus !== null;

  if (alreadySet) {
    throw new AppError(
      "Scores config is already set for this team",
      ERROR_CODES.TEAM_SCORES_CONFIG_ALREADY_SET,
      409,
    );
  }

  const { data: updatedTeam, error: updateError } = await db
    .from(Table.Teams)
    .update({
      gold: values.gold,
      silver: values.silver,
      bronze: values.bronze,
      bonus: values.bonus,
    })
    .eq("id", teamId)
    .select("id, gold, silver, bronze, bonus")
    .single();

  if (updateError) {
    throw new AppError(
      "Failed to set scores config for team",
      ERROR_CODES.TEAM_SCORES_CONFIG_SET_FAILED,
      500,
    );
  }

  return updatedTeam;
};

export const getTeamScoresConfig = async ({
  teamId,
  yearId,
}: {
  teamId: string;
  yearId: string;
}) => {
  const db = getSupabase();

  const { data: teamData, error: teamError } = await db
    .from(Table.Teams)
    .select("id, year_id, gold, silver, bronze, bonus")
    .eq("id", teamId)
    .eq("year_id", yearId)
    .maybeSingle();

  if (teamError) {
    throw new AppError(
      "Failed to fetch team scores config",
      ERROR_CODES.TEAM_SCORES_CONFIG_FETCH_FAILED,
      500,
    );
  }

  if (!teamData) {
    throw new AppError(
      "Team not found for the specified year",
      ERROR_CODES.TEAM_NOT_FOUND,
      404,
    );
  }

  const pointsSet =
    teamData.gold !== null &&
    teamData.silver !== null &&
    teamData.bronze !== null &&
    teamData.bonus !== null;

  return {
    pointsSet,
    scores: pointsSet
      ? {
          gold: teamData.gold as number,
          silver: teamData.silver as number,
          bronze: teamData.bronze as number,
          bonus: teamData.bonus as number,
        }
      : null,
  };
};
