import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { AppError } from "@/utils/error.ts";

export const createTeam = async (teamName: string, yearId: string) => {
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
      "Cannot create team for a locked year",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: createdTeam, error: createTeamError } = await db
    .from(Table.Teams)
    .insert({
      name: teamName,
      year_id: yearData.id,
    })
    .select("id, name, year_id")
    .single();

  if (createTeamError) {
    if (createTeamError.code === "23505") {
      throw new AppError(
        "Team with that name already exists for the specified year",
        ERROR_CODES.TEAM_EXISTS,
        409,
      );
    }

    throw new AppError(
      "Failed to create team",
      ERROR_CODES.CREATE_TEAM_FAILED,
      500,
    );
  }

  return createdTeam;
};

export const getTeamsByYear = async (yearId: string) => {
  const db = getSupabase();

  const { data: teamsData, error: teamsError } = await db
    .from(Table.Teams)
    .select("id, name")
    .eq("year_id", yearId)
    .order("name", { ascending: true });

  if (teamsError) {
    throw new AppError(
      "Failed to fetch teams for the specified year",
      ERROR_CODES.TEAMS_FETCH_FAILED,
      500,
    );
  }

  if (!teamsData) {
    return [];
  }

  return teamsData;
};

export const updateTeamName = async (teamId: string, newName: string) => {
  const db = getSupabase();

  const { data: teamData, error: teamError } = await db
    .from(Table.Teams)
    .select("id, name, year_id")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError) {
    throw new AppError(
      "Failed to fetch team",
      ERROR_CODES.TEAM_FETCH_FAILED,
      500,
    );
  }

  if (!teamData) {
    throw new AppError("Team not found", ERROR_CODES.TEAM_NOT_FOUND, 404);
  }

  const { data: yearData, error: yearError } = await db
    .from(Table.Years)
    .select("id, is_locked")
    .eq("id", teamData.year_id)
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
      "Cannot update team for a locked year",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  if (teamData.name === newName.trim()) {
    return teamData;
  }

  const { data: updatedTeam, error: updateError } = await db
    .from(Table.Teams)
    .update({ name: newName })
    .eq("id", teamId)
    .select("id, name, year_id")
    .single();

  if (updateError) {
    if (updateError.code === "23505") {
      throw new AppError(
        "Team with that name already exists for the specified year",
        ERROR_CODES.TEAM_EXISTS,
        409,
      );
    }

    throw new AppError(
      "Failed to update team name",
      ERROR_CODES.UPDATE_TEAM_FAILED,
      500,
    );
  }

  return updatedTeam;
};

export const copyTeamsToYear = async ({
  yearId,
  teamIds,
}: {
  yearId: string;
  teamIds: string[];
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
      "Cannot create team for a locked year",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: previousYearTeamsData, error: previousYearTeamsError } =
    await db.from(Table.Teams).select("id, year_id, name").in("id", teamIds);

  if (previousYearTeamsError) {
    throw new AppError(
      "Failed to fetch teams to copy",
      ERROR_CODES.TEAMS_FETCH_FAILED,
      500,
    );
  }

  if (!previousYearTeamsData || previousYearTeamsData.length === 0) {
    throw new AppError(
      "No teams found to copy",
      ERROR_CODES.TEAM_NOT_FOUND,
      404,
    );
  }

  const { data: currentYearTeamsData, error: currentYearTeamsError } = await db
    .from(Table.Teams)
    .select("id, name")
    .eq("year_id", yearId);

  if (currentYearTeamsError) {
    throw new AppError(
      "Failed to fetch existing teams for the target year",
      ERROR_CODES.TEAMS_FETCH_FAILED,
      500,
    );
  }

  const existingTeamNames = new Set(
    currentYearTeamsData?.map((team) => team.name.toLowerCase()),
  );

  const teamsToInsert = previousYearTeamsData
    .filter((team) => !existingTeamNames.has(team.name.toLowerCase()))
    .map((team) => ({ name: team.name, year_id: yearId }));

  const teamsToExclude = previousYearTeamsData
    .filter((team) => existingTeamNames.has(team.name.toLowerCase()))
    .map((team) => team.name);

  if (teamsToInsert.length === 0) {
    return { created: [], skipped: teamsToExclude };
  }

  const { data: insertedTeams, error: insertError } = await db
    .from(Table.Teams)
    .insert(teamsToInsert)
    .select("id, name, year_id");

  if (insertError) {
    throw new AppError(
      "Failed to copy teams",
      ERROR_CODES.CREATE_TEAM_FAILED,
      500,
    );
  }

  return {
    created: insertedTeams?.map((team) => team.name),
    skipped: teamsToExclude,
  };
};
