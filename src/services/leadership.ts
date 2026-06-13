import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { getYearScoresStandard } from "@/services/year_scores_standard.ts";
import { AppError } from "@/utils/error.ts";

interface RawTeamLeaderboardEntry {
  participant_id: string;
  raw_score: number;
  year_participants: {
    name: string;
  };
}

interface RawYearLeaderboardEntry {
  participant_id: string;
  team_id: string;
  normalized_score: number;
  year_participants: {
    name: string;
  };
}

export interface LeaderboardParticipant {
  rank: number;
  participant_id: string;
  name: string;
  total_score: number;
}

export interface YearLeaderboardTeam {
  team_id: string;
  team_name: string;
  participants: LeaderboardParticipant[];
}

export interface TeamLeaderboardResponse {
  type: "team";
  data: LeaderboardParticipant[];
}

export interface YearLeaderboardResponse {
  type: "year";
  data: YearLeaderboardTeam[];
}

export type LeaderboardResponse =
  | TeamLeaderboardResponse
  | YearLeaderboardResponse;

function assignDenseRank(
  entries: { total_score: number }[],
): (LeaderboardParticipant & { total_score: number })[] {
  let rank = 1;
  let prevScore: number | null = null;

  return entries.map((entry) => {
    if (prevScore !== null && entry.total_score < prevScore) {
      rank++;
    }
    prevScore = entry.total_score;

    return {
      ...(entry as unknown as {
        participant_id: string;
        name: string;
        total_score: number;
      }),
      rank,
    };
  });
}

export const getTeamLeaderboard = async ({
  yearId,
  teamId,
}: {
  yearId: string;
  teamId: string;
}): Promise<TeamLeaderboardResponse> => {
  const db = getSupabase();

  const { data, error } = await db
    .from("leaderboard")
    .select(
      `
      participant_id,
      raw_score,
      year_participants(name)
    `,
    )
    .eq("year_id", yearId)
    .eq("team_id", teamId)
    .order("raw_score", { ascending: false });

  if (error) {
    throw new AppError(
      "Failed to fetch team leaderboard",
      ERROR_CODES.LEADERBOARD_FETCH_FAILED,
      500,
    );
  }

  const typed = (data ?? []) as unknown as RawTeamLeaderboardEntry[];

  const flat = typed.map((entry) => ({
    participant_id: entry.participant_id,
    name: entry.year_participants.name,
    total_score: Number(entry.raw_score),
  }));

  const ranked = assignDenseRank(flat);

  return {
    type: "team",
    data: ranked,
  };
};

export const getYearLeaderboard = async ({
  yearId,
}: {
  yearId: string;
}): Promise<YearLeaderboardResponse> => {
  const db = getSupabase();

  const { standardSet } = await getYearScoresStandard({ yearId });

  if (!standardSet) {
    throw new AppError(
      "Year scoring standard has not been set",
      ERROR_CODES.YEAR_SCORES_STANDARD_NOT_SET,
      400,
    );
  }

  const { data, error } = await db
    .from("leaderboard")
    .select(
      `
      participant_id,
      team_id,
      normalized_score,
      year_participants(name)
    `,
    )
    .eq("year_id", yearId)
    .order("normalized_score", { ascending: false });

  if (error) {
    throw new AppError(
      "Failed to fetch year leaderboard",
      ERROR_CODES.LEADERBOARD_FETCH_FAILED,
      500,
    );
  }

  const typed = (data ?? []) as unknown as RawYearLeaderboardEntry[];

  // Fetch team names for all unique team IDs
  const teamIds = [...new Set(typed.map((e) => e.team_id))];

  const { data: teamsData, error: teamsError } = await db
    .from("teams")
    .select("id, name")
    .in("id", teamIds);

  if (teamsError) {
    throw new AppError(
      "Failed to fetch team names for leaderboard",
      ERROR_CODES.LEADERBOARD_FETCH_FAILED,
      500,
    );
  }

  const teamNameMap = new Map(
    (teamsData ?? []).map((t: { id: string; name: string }) => [t.id, t.name]),
  );

  const teamMap = new Map<
    string,
    { total_score: number; participant_id: string; name: string }[]
  >();

  for (const entry of typed) {
    const list = teamMap.get(entry.team_id) ?? [];
    list.push({
      participant_id: entry.participant_id,
      name: entry.year_participants.name,
      total_score: Number(entry.normalized_score),
    });
    teamMap.set(entry.team_id, list);
  }

  const result: YearLeaderboardTeam[] = [];

  for (const [teamId, participants] of teamMap) {
    const ranked = assignDenseRank(participants);

    const top = ranked.filter((p) => p.rank <= 2);

    if (top.length === 0) continue;

    result.push({
      team_id: teamId,
      team_name: teamNameMap.get(teamId) ?? "",
      participants: top,
    });
  }

  return {
    type: "year",
    data: result,
  };
};
