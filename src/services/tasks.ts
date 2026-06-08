import type * as zod from "@zod/zod";

import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import type {
  bulkAwardScoreBodySchema,
  eventTypeSchema,
} from "@/schemas/scores.schema.ts";
import { AppError } from "@/utils/error.ts";

interface RawScoreEvent {
  id: string;
  year_participant_id: string;
  event_type: string;
  value: number;
  is_deleted: boolean;
}

interface RawTask {
  id: string;
  title: string;
  max_base_score: number;
  team_id: string | null;
  score_events: RawScoreEvent[];
}

interface RawMembership {
  id: string;
  year_participant_id: string;
}

interface RawTeamLeadCheck {
  id: string;
  team_memberships: Array<{
    id: string;
    team_id: string;
    is_team_lead: boolean;
  }>;
}

interface RawScoreEventRow {
  id: string;
  event_type: string;
  year_participant_id: string;
  task_id: string;
}

interface RawExistingScore {
  id: string;
  event_type: string;
  is_deleted: boolean;
}

export type MedalType = "gold" | "silver" | "bronze";
export type EventType = zod.infer<typeof eventTypeSchema>;
export type BulkScoreEntry = zod.infer<
  typeof bulkAwardScoreBodySchema
>["scores"][number];

export interface ScoreAggregate {
  base: number | null;
  medal: MedalType | null;
  bonus_count: number;
}

export interface TaskSummary {
  id: string;
  title: string;
  max_base_score: number;
  team_id: string | null;
}

export interface TasksResponse {
  tasks: TaskSummary[];
  scores: Record<string, Record<string, ScoreAggregate>>;
}

const FIXED_EVENT_VALUES = {
  gold: 5,
  silver: 3,
  bronze: 2,
  bonus: 1,
} as const;

function resolveEventValue(eventType: EventType, callerValue?: number): number {
  if (eventType === "base") {
    if (callerValue === undefined) {
      throw new AppError(
        "Value is required for base score",
        ERROR_CODES.BAD_REQUEST,
        400,
      );
    }
    return callerValue;
  }
  return FIXED_EVENT_VALUES[eventType];
}

function isMedal(eventType: string): eventType is MedalType {
  return (
    eventType === "gold" || eventType === "silver" || eventType === "bronze"
  );
}

function buildEmptyAggregate(): ScoreAggregate {
  return { base: null, medal: null, bonus_count: 0 };
}

export const verifyTeamLead = async ({
  userId,
  yearId,
  teamId,
}: {
  userId: string;
  yearId: string;
  teamId: string;
}): Promise<boolean> => {
  const db = getSupabase();

  const { data, error } = await db
    .from(Table.YearParticipants)
    .select(`id, ${Table.TeamMemberships}!inner(id, team_id, is_team_lead)`)
    .eq("year_id", yearId)
    .eq("user_id", userId)
    .eq(`${Table.TeamMemberships}.team_id`, teamId)
    .eq(`${Table.TeamMemberships}.is_team_lead`, true)
    .maybeSingle();

  if (error || !data) return false;

  const typed = data as unknown as RawTeamLeadCheck;
  return (
    Array.isArray(typed.team_memberships) &&
    typed.team_memberships.length > 0 &&
    typed.team_memberships[0]?.is_team_lead === true
  );
};

export const createTask = async ({
  yearId,
  title,
  maxBaseScore,
  teamId,
}: {
  yearId: string;
  title: string;
  maxBaseScore: number;
  teamId?: string;
}) => {
  const db = getSupabase();

  const { data, error } = await db
    .from(Table.Tasks)
    .insert({
      year_id: yearId,
      title,
      max_base_score: maxBaseScore,
      team_id: teamId ?? null,
    })
    .select("id, title, max_base_score, team_id, year_id")
    .single();

  if (error) {
    throw new AppError(
      "Failed to create task",
      ERROR_CODES.TASK_CREATION_FAILED,
      500,
    );
  }

  return data;
};

export const getTasksWithScores = async ({
  yearId,
  teamId,
}: {
  yearId: string;
  teamId: string;
}): Promise<TasksResponse> => {
  const db = getSupabase();

  const { data: membershipsData, error: membershipsError } = await db
    .from(Table.TeamMemberships)
    .select(
      `
      id,
      year_participant_id,
      year_participants!inner(id)
    `,
    )
    .eq("team_id", teamId)
    .eq("year_participants.year_id", yearId)
    .is("year_participants.user_id", null)
    .eq("is_deleted", false);

  if (membershipsError) {
    throw new AppError(
      "Failed to fetch team participants",
      ERROR_CODES.TEAM_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  const typedMemberships = (membershipsData ??
    []) as unknown as RawMembership[];
  const participantIds = typedMemberships.map((m) => m.year_participant_id);

  const baseQuery = db
    .from(Table.Tasks)
    .select(
      `
      id,
      title,
      max_base_score,
      team_id,
      score_events(
        id,
        year_participant_id,
        event_type,
        value,
        is_deleted
      )
    `,
    )
    .eq("year_id", yearId)
    .or(`team_id.eq.${teamId},team_id.is.null`)
    .eq("score_events.is_deleted", false);

  const tasksQuery =
    participantIds.length > 0
      ? baseQuery.in("score_events.year_participant_id", participantIds)
      : baseQuery;

  const { data: tasksData, error: tasksError } = await tasksQuery;

  if (tasksError) {
    throw new AppError(
      "Failed to fetch tasks",
      ERROR_CODES.TASK_FETCH_FAILED,
      500,
    );
  }

  const typedTasks = (tasksData ?? []) as unknown as RawTask[];

  const scores: Record<string, Record<string, ScoreAggregate>> = {};

  for (const task of typedTasks) {
    scores[task.id] = {};

    for (const event of task.score_events ?? []) {
      const pid = event.year_participant_id;

      if (!scores[task.id][pid]) {
        scores[task.id][pid] = buildEmptyAggregate();
      }

      const agg = scores[task.id][pid] as ScoreAggregate;

      if (event.event_type === "base") {
        agg.base = event.value;
      } else if (isMedal(event.event_type)) {
        agg.medal = event.event_type;
      } else if (event.event_type === "bonus") {
        agg.bonus_count += 1;
      }
    }
  }

  return {
    tasks: typedTasks.map((t) => ({
      id: t.id,
      title: t.title,
      max_base_score: t.max_base_score,
      team_id: t.team_id,
    })),
    scores,
  };
};

export const awardScore = async ({
  taskId,
  yearParticipantId,
  eventType,
  value,
  createdBy,
  teamId,
}: {
  taskId: string;
  yearParticipantId: string;
  eventType: EventType;
  value: number;
  createdBy: string;
  teamId: string;
}) => {
  const db = getSupabase();

  const { data: membershipData, error: membershipError } = await db
    .from(Table.TeamMemberships)
    .select("id")
    .eq("team_id", teamId)
    .eq("year_participant_id", yearParticipantId)
    .maybeSingle();

  if (membershipError) {
    throw new AppError(
      "Failed to verify participant membership",
      ERROR_CODES.TEAM_MEMBERSHIP_FETCH_FAILED,
      500,
    );
  }

  if (!membershipData) {
    throw new AppError(
      "Participant does not belong to this team",
      ERROR_CODES.PARTICIPANT_NOT_IN_TEAM,
      403,
    );
  }

  const { data: participantEvents, error: participantEventsError } = await db
    .from(Table.ScoreEvents)
    .select("id, event_type, year_participant_id, task_id")
    .eq("task_id", taskId)
    .eq("year_participant_id", yearParticipantId)
    .eq("is_deleted", false);

  if (participantEventsError) {
    throw new AppError(
      "Failed to check existing scores",
      ERROR_CODES.SCORE_FETCH_FAILED,
      500,
    );
  }

  const typedParticipantEvents = (participantEvents ??
    []) as unknown as RawScoreEventRow[];

  if (eventType === "base") {
    const hasBase = typedParticipantEvents.some((e) => e.event_type === "base");
    if (hasBase) {
      throw new AppError(
        "Participant already has a base score for this task",
        ERROR_CODES.SCORE_DUPLICATE_BASE,
        409,
      );
    }
  }

  if (isMedal(eventType)) {
    const hasMedal = typedParticipantEvents.some((e) => isMedal(e.event_type));
    if (hasMedal) {
      throw new AppError(
        "Participant already has a medal for this task",
        ERROR_CODES.SCORE_DUPLICATE_MEDAL,
        409,
      );
    }

    await assertMedalNotTaken({ db, taskId, teamId, medalType: eventType });
  }

  const resolvedValue = resolveEventValue(eventType, value);

  const { data: insertedEvent, error: insertError } = await db
    .from(Table.ScoreEvents)
    .insert({
      task_id: taskId,
      year_participant_id: yearParticipantId,
      event_type: eventType,
      value: resolvedValue,
      created_by: createdBy,
      is_deleted: false,
    })
    .select("id, task_id, year_participant_id, event_type, value")
    .single();

  if (insertError) {
    throw new AppError(
      "Failed to award score",
      ERROR_CODES.SCORE_AWARD_FAILED,
      500,
    );
  }

  return insertedEvent;
};

export const bulkAwardScores = async ({
  taskId,
  scores,
  createdBy,
  teamId,
}: {
  taskId: string;
  scores: BulkScoreEntry[];
  createdBy: string;
  teamId: string;
}) => {
  const db = getSupabase();

  const participantIds = [...new Set(scores.map((s) => s.yearParticipantId))];

  const { data: membershipsData, error: membershipsError } = await db
    .from(Table.TeamMemberships)
    .select("year_participant_id")
    .eq("team_id", teamId)
    .in("year_participant_id", participantIds);

  if (membershipsError) {
    throw new AppError(
      "Failed to verify participant memberships",
      ERROR_CODES.TEAM_MEMBERSHIP_FETCH_FAILED,
      500,
    );
  }

  const typedMemberships = (membershipsData ?? []) as unknown as Array<{
    year_participant_id: string;
  }>;
  const foundIds = new Set(typedMemberships.map((m) => m.year_participant_id));
  const missingParticipant = participantIds.find((id) => !foundIds.has(id));

  if (missingParticipant) {
    throw new AppError(
      `Participant ${missingParticipant} does not belong to this team`,
      ERROR_CODES.PARTICIPANT_NOT_IN_TEAM,
      403,
    );
  }

  const { data: existingEvents, error: existingError } = await db
    .from(Table.ScoreEvents)
    .select("id, event_type, year_participant_id, task_id")
    .eq("task_id", taskId)
    .in("year_participant_id", Array.from(foundIds))
    .eq("is_deleted", false);

  if (existingError) {
    throw new AppError(
      "Failed to check existing scores",
      ERROR_CODES.SCORE_FETCH_FAILED,
      500,
    );
  }

  const typedExisting = (existingEvents ?? []) as unknown as RawScoreEventRow[];

  const existingByParticipant = new Map<string, RawScoreEventRow[]>();

  for (const event of typedExisting) {
    const list = existingByParticipant.get(event.year_participant_id) ?? [];
    list.push(event);
    existingByParticipant.set(event.year_participant_id, list);
  }

  const takenMedalsInDb = new Set(
    typedExisting.filter((e) => isMedal(e.event_type)).map((e) => e.event_type),
  );

  const batchMedals = new Set<string>();

  for (const entry of scores) {
    const participantExisting =
      existingByParticipant.get(entry.yearParticipantId) ?? [];

    if (entry.eventType === "base") {
      const hasBase = participantExisting.some((e) => e.event_type === "base");
      if (hasBase) {
        throw new AppError(
          `Participant ${entry.yearParticipantId} already has a base score for this task`,
          ERROR_CODES.SCORE_DUPLICATE_BASE,
          409,
        );
      }
    }

    if (isMedal(entry.eventType)) {
      const hasMedal = participantExisting.some((e) => isMedal(e.event_type));
      if (hasMedal) {
        throw new AppError(
          `Participant ${entry.yearParticipantId} already has a medal for this task`,
          ERROR_CODES.SCORE_DUPLICATE_MEDAL,
          409,
        );
      }

      if (
        takenMedalsInDb.has(entry.eventType) ||
        batchMedals.has(entry.eventType)
      ) {
        throw new AppError(
          `${entry.eventType} medal already awarded for this task in this team`,
          ERROR_CODES.MEDAL_TAKEN,
          409,
        );
      }

      batchMedals.add(entry.eventType);
    }
  }

  const rows = scores.map((s) => ({
    task_id: taskId,
    year_participant_id: s.yearParticipantId,
    event_type: s.eventType,
    value: resolveEventValue(s.eventType, s.value),
    created_by: createdBy,
    is_deleted: false,
  }));

  const { data: inserted, error: insertError } = await db
    .from(Table.ScoreEvents)
    .insert(rows)
    .select("id, task_id, year_participant_id, event_type, value");

  if (insertError) {
    throw new AppError(
      "Failed to bulk award scores",
      ERROR_CODES.SCORE_AWARD_FAILED,
      500,
    );
  }

  return inserted;
};

export const editBaseScore = async ({
  scoreEventId,
  value,
}: {
  scoreEventId: string;
  value: number;
}) => {
  const db = getSupabase();

  const { data: existing, error: fetchError } = await db
    .from(Table.ScoreEvents)
    .select("id, event_type, is_deleted")
    .eq("id", scoreEventId)
    .maybeSingle();

  if (fetchError) {
    throw new AppError(
      "Failed to fetch score event",
      ERROR_CODES.SCORE_FETCH_FAILED,
      500,
    );
  }

  if (!existing) {
    throw new AppError(
      "Score event not found",
      ERROR_CODES.SCORE_EVENT_NOT_FOUND,
      404,
    );
  }

  const typedExisting = existing as unknown as RawExistingScore;

  if (typedExisting.is_deleted) {
    throw new AppError(
      "Score event has been deleted",
      ERROR_CODES.SCORE_EVENT_NOT_FOUND,
      404,
    );
  }

  if (typedExisting.event_type !== "base") {
    throw new AppError(
      "Only base score values can be edited",
      ERROR_CODES.BAD_REQUEST,
      400,
    );
  }

  const { data: updated, error: updateError } = await db
    .from(Table.ScoreEvents)
    .update({ value })
    .eq("id", scoreEventId)
    .select("id, task_id, year_participant_id, event_type, value")
    .single();

  if (updateError) {
    throw new AppError(
      "Failed to update score",
      ERROR_CODES.SCORE_EDIT_FAILED,
      500,
    );
  }

  return updated;
};

async function assertMedalNotTaken({
  db,
  taskId,
  teamId,
  medalType,
}: {
  db: ReturnType<typeof getSupabase>;
  taskId: string;
  teamId: string;
  medalType: MedalType;
}): Promise<void> {
  // Get all scorable participants in the team to scope the medal check
  const { data: memberships, error: membershipsError } = await db
    .from(Table.TeamMemberships)
    .select("year_participant_id")
    .eq("team_id", teamId);

  if (membershipsError) {
    throw new AppError(
      "Failed to check medal constraints",
      ERROR_CODES.SCORE_FETCH_FAILED,
      500,
    );
  }

  const typedMemberships = (memberships ?? []) as unknown as Array<{
    year_participant_id: string;
  }>;
  const teamParticipantIds = typedMemberships.map((m) => m.year_participant_id);

  if (teamParticipantIds.length === 0) return;

  const { data: medalEvents, error: medalError } = await db
    .from(Table.ScoreEvents)
    .select("id")
    .eq("task_id", taskId)
    .eq("event_type", medalType)
    .in("year_participant_id", teamParticipantIds)
    .eq("is_deleted", false)
    .limit(1);

  if (medalError) {
    throw new AppError(
      "Failed to check medal constraints",
      ERROR_CODES.SCORE_FETCH_FAILED,
      500,
    );
  }

  const typedMedalEvents = (medalEvents ?? []) as unknown as Array<{
    id: string;
  }>;

  if (typedMedalEvents.length > 0) {
    throw new AppError(
      `${medalType} medal already awarded for this task in this team`,
      ERROR_CODES.MEDAL_TAKEN,
      409,
    );
  }
}
