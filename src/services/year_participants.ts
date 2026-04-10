import type * as zod from "@zod/zod";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { yearParticipantsSchema } from "@/schemas/year_participants.schema.ts";
import {
  type BulkAddResult,
  type BulkFailedRow,
  type BulkSucceededRow,
  hasRequiredRole,
  type ParticipantBanResult,
  type ParticipantUnbanResult,
  Role,
  type YearParticipantFilters,
} from "@/types";
import { AppError } from "@/utils/error.ts";
import {
  applyPrivacyMask,
  banTeamLead,
  banVolunteer,
  getRequesterTeam,
} from "@/utils/participants.ts";

export const addYearParticipant = async ({
  yearId,
  userId,
  name,
  email,
  mobile,
  regId,
}: {
  yearId: string;
  userId?: string;
  name: string;
  email: string;
  mobile: string;
  regId?: string;
}) => {
  const db = getSupabase();

  const { data: fetchYear, error: fetchYearError } = await db
    .from("years")
    .select()
    .eq("id", yearId)
    .maybeSingle();

  if (fetchYearError) {
    throw new AppError(
      "Failed to fetch year",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!fetchYear) {
    throw new AppError("Year not found", ERROR_CODES.YEAR_NOT_FOUND, 404);
  }

  if (fetchYear.is_locked) {
    throw new AppError(
      "Year is locked. Cannot add participants.",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  let disqualifiedDetails = null;

  const { data: existingParticipant, error: existingParticipantError } =
    await db
      .from("year_participants")
      .select("id, year_id, name, email, banned, disqualified")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1);

  if (existingParticipantError) {
    throw new AppError(
      "Failed to check existing participants",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (existingParticipant && existingParticipant.length > 0) {
    // Banned logic: If there's an existing participant with the same email, check if any of them are banned. If yes, prevent registration and provide info about the ban.

    if (existingParticipant[0].banned) {
      const bannedParticipant = existingParticipant[0];

      throw new AppError(
        "A participant with this email was previously banned.",
        ERROR_CODES.PARTICIPANT_BANNED,
        403,
        {
          name: bannedParticipant.name,
          email: bannedParticipant.email,
        },
      );
    }

    // Disqualify logic:
    if (existingParticipant[0]?.disqualified) {
      disqualifiedDetails = {
        name: existingParticipant[0].name,
        email: existingParticipant[0].email,
      };
    }
  }

  const { data: insertedParticipant, error: insertError } = await db
    .from("year_participants")
    .insert({
      year_id: yearId,
      ...(userId ? { user_id: userId } : {}),
      name,
      email,
      mobile,
      ...(regId ? { reg_id: regId } : {}),
      banned: false,
      disqualified: false,
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      throw new AppError(
        "Participant with the same email already exists for this year",
        ERROR_CODES.YEAR_PARTICIPANT_ALREADY_EXISTS,
        409,
      );
    }

    throw new AppError(
      "Failed to add participant to the year",
      ERROR_CODES.YEAR_PARTICIPANT_CREATION_FAILED,
      500,
    );
  }

  return { participant: insertedParticipant, disqualifiedDetails };
};

export const bulkAddYearParticipants = async ({
  yearId,
  rows,
}: {
  yearId: string;
  rows: Record<string, string>[];
}): Promise<BulkAddResult> => {
  const db = getSupabase();

  const { data: fetchYear, error: fetchYearError } = await db
    .from("years")
    .select()
    .eq("id", yearId)
    .maybeSingle();

  if (fetchYearError) {
    throw new AppError(
      "Failed to fetch year",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!fetchYear) {
    throw new AppError("Year not found", ERROR_CODES.YEAR_NOT_FOUND, 404);
  }

  if (fetchYear.is_locked) {
    throw new AppError(
      "Year is locked. Cannot add participants.",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const succeededRows: BulkSucceededRow[] = [];
  const failedRows: BulkFailedRow[] = [];
  const validRows: {
    rowNumber: number;
    data: zod.infer<typeof yearParticipantsSchema>;
  }[] = [];

  for (const [index, row] of rows.entries()) {
    const rowNumber = index + 2;

    const parseResult = yearParticipantsSchema.safeParse(row);

    if (!parseResult.success) {
      failedRows.push({
        row: rowNumber,
        name: row?.name,
        email: row?.email,
        mobile: row?.mobile,
        reason: `Validation failed - ${parseResult.error.issues.map((issue) => issue.message).join(", ")}`,
      });
      continue;
    }

    validRows.push({ rowNumber, data: parseResult.data });
  }

  if (validRows.length === 0) {
    return { succeeded: succeededRows, failed: failedRows };
  }

  const validEmails = validRows.map((row) => row.data.email);

  const { data: existingParticipants, error: existingParticipantsError } =
    await db
      .from("year_participants")
      .select("id, year_id, name, email, banned, disqualified")
      .in("email", validEmails)
      .order("created_at", { ascending: false });

  if (existingParticipantsError) {
    throw new AppError(
      "Failed to check existing participants",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  const existingParticipantsMap = new Map<
    string,
    (typeof existingParticipants)[0]
  >();

  existingParticipants?.forEach((participant) => {
    if (!existingParticipantsMap.has(participant.email)) {
      existingParticipantsMap.set(participant.email, participant);
    }
  });

  const rowsToInsert: {
    year_id: string;
    user_id?: string;
    name: string;
    email: string;
    mobile: string;
    reg_id?: string;
    banned: boolean;
    disqualified: boolean;
  }[] = [];

  const rowMetadata = new Map<
    string,
    {
      row: number;
      warning?: string;
    }
  >();

  for (const { rowNumber, data } of validRows) {
    const existingParticipant = existingParticipantsMap.get(data.email);

    if (existingParticipant) {
      if (existingParticipant.banned) {
        failedRows.push({
          row: rowNumber,
          name: data.name,
          email: data.email,
          mobile: data.mobile,
          reason: "A participant with this email was previously banned.",
        });
        continue;
      }

      if (existingParticipant?.year_id === yearId) {
        failedRows.push({
          row: rowNumber,
          name: data.name,
          email: data.email,
          mobile: data.mobile,
          reason: "Participant with this email already exists for this year.",
        });
        continue;
      }

      if (existingParticipant.disqualified) {
        rowMetadata.set(data.email, {
          row: rowNumber,
          warning: `The participant ${existingParticipant.name} with email ${existingParticipant.email} was disqualified the last time they volunteered.`,
        });
      }
    }

    rowsToInsert.push({
      year_id: yearId,
      ...(data?.userId ? { user_id: data?.userId } : {}),
      name: data.name,
      email: data.email,
      mobile: data.mobile,
      ...(data?.regId ? { reg_id: data?.regId } : {}),
      banned: false,
      disqualified: false,
    });

    if (!rowMetadata.has(data.email)) {
      rowMetadata.set(data.email, {
        row: rowNumber,
      });
    }
  }

  if (rowsToInsert.length === 0) {
    return { succeeded: succeededRows, failed: failedRows };
  }

  const { data: insertedParticipants, error: insertError } = await db
    .from("year_participants")
    .insert(rowsToInsert)
    .select();

  if (!insertError && insertedParticipants) {
    // bulk succeeded — map to succeededRows
    for (const inserted of insertedParticipants) {
      const meta = rowMetadata.get(inserted.email);
      if (!meta) continue;
      succeededRows.push({
        row: meta.row,
        name: inserted.name,
        email: inserted.email,
        mobile: inserted.mobile,
        warning: meta?.warning,
      });
    }
    return { succeeded: succeededRows, failed: failedRows };
  }

  // bulk failed
  if (insertError.code !== "23505") {
    throw new AppError(
      "Failed to add participants",
      ERROR_CODES.YEAR_PARTICIPANT_CREATION_FAILED,
      500,
    );
  }

  // fallback — one by one
  for (const row of rowsToInsert) {
    const { data: inserted, error: rowError } = await db
      .from("year_participants")
      .insert(row)
      .select()
      .single();

    const meta = rowMetadata.get(row.email);
    if (!meta) continue;

    if (!rowError) {
      succeededRows.push({
        row: meta.row,
        name: inserted.name,
        email: inserted.email,
        mobile: inserted.mobile,
        warning: meta?.warning,
      });
      continue;
    }

    if (rowError.code === "23505") {
      failedRows.push({
        row: meta.row,
        name: row.name,
        email: row.email,
        mobile: row.mobile,
        reason: "Participant already registered for this year.",
      });
      continue;
    }

    throw new AppError(
      "Failed to add participant",
      ERROR_CODES.YEAR_PARTICIPANT_CREATION_FAILED,
      500,
    );
  }

  return { succeeded: succeededRows, failed: failedRows };
};

export const getYearsParticipants = async ({
  yearId,
  userId,
  role,
  filters,
}: {
  yearId: string;
  userId: string;
  role: Role;
  filters: YearParticipantFilters;
}) => {
  const db = getSupabase();

  const { canSeePII } = await getRequesterTeam({
    yearId,
    userId,
    role,
  });

  const hasPIIPermission = hasRequiredRole(role, Role.Admin);

  let nameFilter: string | undefined;
  let emailFilter: string | undefined;
  let mobileFilter: string | undefined;

  if (hasPIIPermission) {
    if (filters.email) {
      emailFilter = filters.email;
    } else if (filters.mobile) {
      mobileFilter = filters.mobile;
    } else if (filters.name) {
      nameFilter = filters.name;
    }
  } else {
    if (filters.name) {
      nameFilter = filters.name;
    }
  }

  const sortColumn: "name" | "email" = hasPIIPermission
    ? (filters.sort ?? "name")
    : "name";
  const sortAscending = filters.order !== "desc";

  let baseQuery = db
    .from("year_participants")
    .select(
      "id, name, email, mobile, reg_id, banned, disqualified, team_memberships(id, team_id, is_team_lead)",
      { count: "exact" },
    )
    .eq("year_id", yearId)
    .is("user_id", null)
    .or("banned.eq.false,banned.is.null")
    .order(sortColumn, { ascending: sortAscending });

  if (nameFilter) {
    baseQuery = baseQuery.ilike("name", `%${nameFilter}%`);
  }

  if (emailFilter) {
    baseQuery = baseQuery.ilike("email", `%${emailFilter}%`);
  }

  if (mobileFilter) {
    baseQuery = baseQuery.ilike("mobile", `%${mobileFilter}%`);
  }

  const page = Math.max(DEFAULT_PAGE, filters.page ?? DEFAULT_PAGE);
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;

  const { data, error, count } = await baseQuery.range(from, to);

  if (error) {
    throw new AppError(
      "Failed to fetch participants",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  const participantsData = (data ?? []).map((item) => {
    return {
      id: item.id,
      team_member_id: item.team_memberships[0]?.id ?? null,
      name: item.name,
      email: item.email,
      mobile: item.mobile,
      reg_id: item.reg_id,
      banned: item.banned,
      disqualified: item.disqualified,
      team_membership_id: item.team_memberships[0]?.id ?? null,
      team_id: item.team_memberships[0]?.team_id ?? null,
      is_team_lead: item.team_memberships[0]?.is_team_lead ?? false,
    };
  });

  const maskedData = applyPrivacyMask(participantsData, canSeePII);

  return {
    participants: maskedData,
    total: count ?? 0,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
  };
};

export const banParticipant = async ({
  yearId,
  participantId,
}: {
  yearId: string;
  participantId: string;
}): Promise<ParticipantBanResult> => {
  const db = getSupabase();

  const { data: fetchYearParticipant, error: fetchYearParticipantError } =
    await db
      .from("year_participants")
      .select("id, user_id, banned")
      .eq("id", participantId)
      .eq("year_id", yearId)
      .or("banned.eq.false,banned.is.null")
      .maybeSingle();

  if (fetchYearParticipantError) {
    throw new AppError(
      "Failed to fetch year participant",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (!fetchYearParticipant) {
    throw new AppError(
      "Participant not found or already banned",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND_OR_ALREADY_BANNED,
      404,
    );
  }

  if (!fetchYearParticipant.user_id) {
    return await banVolunteer({ participantId });
  }

  const { data: profileData, error: profileError } = await db
    .from("profiles")
    .select("id, global_role")
    .eq("id", fetchYearParticipant.user_id)
    .maybeSingle();

  if (profileError) {
    throw new AppError(
      "Failed to fetch participant profile",
      ERROR_CODES.PROFILE_LOOKUP_FAILED,
      500,
    );
  }

  if (!profileData) {
    throw new AppError(
      "Participant profile not found",
      ERROR_CODES.PROFILE_NOT_FOUND,
      404,
    );
  }

  if (
    profileData.global_role === Role.Admin ||
    profileData.global_role === Role.Superadmin
  ) {
    throw new AppError(
      "Cannot ban a participant with admin or superadmin role",
      ERROR_CODES.TEAM_LEAD_BAN_FAILED,
      403,
    );
  }

  if (profileData.global_role !== Role.User) {
    throw new AppError(
      "Unexpected participant role",
      ERROR_CODES.FORBIDDEN,
      403,
    );
  }

  return await banTeamLead({
    participantId,
    yearId,
    userId: profileData.id,
  });
};

export const unbanParticipant = async ({
  yearId,
  participantId,
  restoreCompleteAccess = false,
}: {
  yearId: string;
  participantId: string;
  restoreCompleteAccess?: boolean;
}): Promise<ParticipantUnbanResult> => {
  const db = getSupabase();

  const { data: participantData, error: participantError } = await db
    .from("year_participants")
    .select("id, user_id, banned")
    .eq("id", participantId)
    .eq("year_id", yearId)
    .maybeSingle();

  if (participantError) {
    throw new AppError(
      "Failed to fetch participant",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }
  if (!participantData) {
    throw new AppError(
      "Participant not found",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  if (!participantData.banned) {
    throw new AppError(
      "Participant is not banned",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_BANNED,
      400,
    );
  }

  let auth_restored = false;

  if (participantData.user_id) {
    const { error: authError } = await db.auth.admin.updateUserById(
      participantData.user_id,
      {
        ban_duration: "none",
      },
    );

    if (authError) {
      throw new AppError(
        "Auth API failed to restore account",
        ERROR_CODES.PARTICIPANT_BAN_FAILED,
        500,
      );
    }

    auth_restored = true;
  }

  const { error: rpcError } = await db.rpc("unban_participant", {
    p_participant_id: participantId,
  });

  if (rpcError) {
    if (!participantData.user_id) {
      throw new AppError(
        "Failed to unban participant",
        ERROR_CODES.PARTICIPANT_UNBAN_FAILED,
        500,
      );
    }

    return {
      success: false,
      auth_restored,
      restoredCompleteAccess: false,
      db_updated: false,
      data: null,
    };
  }

  const { data: updatedRecord } = await db
    .from("year_participants")
    .select("id, year_id, name, mobile, email, user_id, reg_id, banned")
    .eq("id", participantId)
    .maybeSingle();

  if (!restoreCompleteAccess) {
    return {
      success: true,
      auth_restored,
      restoredCompleteAccess: false,
      db_updated: true,
      data: updatedRecord,
    };
  }

  if (!(restoreCompleteAccess && participantData.user_id)) {
    return {
      success: false,
      auth_restored,
      restoredCompleteAccess: false,
      db_updated: true,
      data: updatedRecord,
    };
  }

  const { error: restoreAccessRpcError } = await db.rpc(
    "restore_team_lead_access",
    {
      p_year_id: yearId,
      p_user_id: participantData.user_id,
    },
  );

  if (restoreAccessRpcError) {
    return {
      success: false,
      auth_restored,
      restoredCompleteAccess: false,
      db_updated: true,
      data: updatedRecord,
    };
  }

  return {
    success: true,
    auth_restored,
    restoredCompleteAccess: true,
    db_updated: true,
    data: updatedRecord,
  };
};

export const disqualifyParticipant = async ({
  yearId,
  participantId,
}: {
  yearId: string;
  participantId: string;
}) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from("years")
    .select("id, is_locked")
    .eq("id", yearId)
    .maybeSingle();

  if (yearError) {
    throw new AppError(
      "Failed to fetch year",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!yearData) {
    throw new AppError("Year not found", ERROR_CODES.YEAR_NOT_FOUND, 404);
  }

  if (yearData.is_locked) {
    throw new AppError(
      "Year is locked. Cannot disqualify participants.",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: participantData, error: participantError } = await db
    .from("year_participants")
    .select(
      "id, year_id, name, mobile, email, reg_id, user_id, banned, disqualified",
    )
    .eq("id", participantId)
    .eq("year_id", yearId)
    .maybeSingle();

  if (participantError) {
    throw new AppError(
      "Failed to fetch participant",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (!participantData) {
    throw new AppError(
      "Participant not found",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  if (participantData.disqualified) {
    throw new AppError(
      "Participant is already disqualified",
      ERROR_CODES.YEAR_PARTICIPANT_ALREADY_DISQUALIFIED,
      400,
    );
  }

  if (participantData.user_id) {
    throw new AppError(
      "Cannot disqualify a team lead.",
      ERROR_CODES.FORBIDDEN,
      403,
    );
  }

  const { error: disqualifyParticipantError } = await db
    .from("year_participants")
    .update({ disqualified: true })
    .eq("id", participantId)
    .eq("year_id", yearId);

  if (disqualifyParticipantError) {
    throw new AppError(
      "Failed to disqualify participant",
      ERROR_CODES.YEAR_PARTICIPANT_DISQUALIFY_FAILED,
      500,
    );
  }

  return { ...participantData, disqualified: true };
};

export const undisqualifyParticipant = async ({
  yearId,
  participantId,
}: {
  yearId: string;
  participantId: string;
}) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from("years")
    .select("id, is_locked")
    .eq("id", yearId)
    .maybeSingle();

  if (yearError) {
    throw new AppError(
      "Failed to fetch year",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!yearData) {
    throw new AppError("Year not found", ERROR_CODES.YEAR_NOT_FOUND, 404);
  }

  if (yearData.is_locked) {
    throw new AppError(
      "Year is locked. Cannot undisqualify participants.",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: participantData, error: participantError } = await db
    .from("year_participants")
    .select(
      "id, year_id, name, mobile, email, reg_id, user_id, banned, disqualified",
    )
    .eq("id", participantId)
    .eq("year_id", yearId)
    .maybeSingle();

  if (participantError) {
    throw new AppError(
      "Failed to fetch participant",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (!participantData) {
    throw new AppError(
      "Participant not found",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_FOUND,
      404,
    );
  }

  if (!participantData.disqualified) {
    throw new AppError(
      "Participant is not disqualified",
      ERROR_CODES.YEAR_PARTICIPANT_NOT_DISQUALIFIED,
      400,
    );
  }

  const { error: undisqualifyParticipantError } = await db
    .from("year_participants")
    .update({ disqualified: false })
    .eq("id", participantId)
    .eq("year_id", yearId);

  if (undisqualifyParticipantError) {
    throw new AppError(
      "Failed to undisqualify participant",
      ERROR_CODES.YEAR_PARTICIPANT_UNDISQUALIFY_FAILED,
      500,
    );
  }

  return { ...participantData, disqualified: false };
};

export const getTeamLeadsForYear = async (yearId: string) => {
  const db = getSupabase();

  const { data: yearsData, error: yearsError } = await db
    .from("years")
    .select("id")
    .eq("id", yearId)
    .maybeSingle();

  if (yearsError) {
    throw new AppError(
      "Failed to fetch year",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (!yearsData) {
    throw new AppError("Year not found", ERROR_CODES.YEAR_NOT_FOUND, 404);
  }

  const { data: teamLeadsData, error: teamLeadsError } = await db
    .from("year_participants")
    .select(
      "id, name, email, mobile, reg_id, user_id, banned, team_memberships(id, team_id, is_team_lead)",
    )
    .eq("year_id", yearsData.id)
    .not("user_id", "is", null);

  if (teamLeadsError) {
    throw new AppError(
      "Failed to fetch team leads",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  const teamLeads = teamLeadsData.map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    mobile: item.mobile,
    reg_id: item.reg_id,
    user_id: item.user_id,
    banned: item.banned,
    team_membership_id: item.team_memberships[0]?.id ?? null,
    team_id: item.team_memberships[0]?.team_id ?? null,
    is_team_lead: item.team_memberships[0]?.is_team_lead ?? false,
  }));

  return teamLeads;
};
