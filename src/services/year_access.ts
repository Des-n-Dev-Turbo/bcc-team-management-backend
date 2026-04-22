import { MAX_YEAR_REQUEST_ATTEMPTS, Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import {
  Role,
  type YearAccessEntry,
  type YearAccessPendingEntry,
  type YearAccessRejectedEntry,
  type YearAccessRequestsResult,
  YearAccessStatus,
} from "@/types";
import { AppError } from "@/utils/error.ts";
import { getAllAppUsers } from "@/utils/users.ts";

export const requestYearAccess = async ({
  yearId,
  userId,
}: {
  yearId: string;
  userId: string;
}) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from(Table.Years)
    .select("id, name, is_locked")
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
      "Year is already locked",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const { data: yearAccessData, error: yearAccessError } = await db
    .from(Table.YearAccess)
    .select("id, user_id, year_id, status")
    .eq("user_id", userId)
    .eq("year_id", yearData.id)
    .order("created_at", { ascending: false });

  if (yearAccessError) {
    throw new AppError(
      "Failed to fetch year access data",
      ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
      500,
    );
  }

  if (yearAccessData && yearAccessData.length >= MAX_YEAR_REQUEST_ATTEMPTS) {
    throw new AppError(
      `The attempts to request access for year ${yearData.name} has been exceeded. No more attempts left.`,
      ERROR_CODES.REQUEST_ATTEMPTS_EXCEEDED,
      429,
    );
  }

  const previousRequestData = yearAccessData?.[0];

  if (
    previousRequestData &&
    previousRequestData.status === YearAccessStatus.PENDING
  ) {
    throw new AppError(
      "You cannot request while previous request is still pending",
      ERROR_CODES.FORBIDDEN,
      409,
    );
  }

  if (
    previousRequestData &&
    previousRequestData.status === YearAccessStatus.APPROVED
  ) {
    throw new AppError(
      "You already have access to this year",
      ERROR_CODES.FORBIDDEN,
      409,
    );
  }

  const { data: requestData, error: requestError } = await db
    .from(Table.YearAccess)
    .insert({
      user_id: userId,
      year_id: yearData.id,
      status: YearAccessStatus.PENDING,
    })
    .select()
    .single();

  if (requestError) {
    throw new AppError(
      "Error while raising request",
      ERROR_CODES.YEAR_ACCESS_REQUEST_FAILED,
      500,
    );
  }

  return requestData;
};

export const updateYearAccess = async ({
  id,
  status,
}: {
  id: string;
  status: YearAccessStatus.APPROVED | YearAccessStatus.REJECTED;
}) => {
  const db = getSupabase();

  const { data: yearAccessData, error: yearAccessError } = await db
    .from(Table.YearAccess)
    .select("id, user_id, year_id, status")
    .eq("id", id)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (yearAccessError) {
    throw new AppError(
      "Failed to fetch year access data",
      ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
      500,
    );
  }

  if (!yearAccessData) {
    throw new AppError(
      "There is no request with this id.",
      ERROR_CODES.YEAR_ACCESS_REQUEST_NOT_AVAILABLE,
      404,
    );
  }

  if (yearAccessData.status !== YearAccessStatus.PENDING) {
    throw new AppError(
      "The request access is not pending. Please check the request details.",
      ERROR_CODES.FORBIDDEN,
      409,
    );
  }

  const { data: updateAccessData, error: updateAccessError } = await db
    .from(Table.YearAccess)
    .update({ status })
    .eq("id", yearAccessData.id)
    .select("id, user_id, year_id, status")
    .single();

  if (updateAccessError) {
    throw new AppError(
      `Error while ${status === YearAccessStatus.APPROVED ? "approving" : "rejecting"} request`,
      status === YearAccessStatus.APPROVED
        ? ERROR_CODES.YEAR_ACCESS_REQUEST_APPROVE_FAILED
        : ERROR_CODES.YEAR_ACCESS_REQUEST_REJECT_FAILED,
      500,
    );
  }

  return updateAccessData;
};

export const getYearAccessRequests = async ({ yearId }: { yearId: string }) => {
  const db = getSupabase();

  const { data: yearsAccessData, error: yearsAccessError } = await db
    .from(Table.YearAccess)
    .select("id, user_id, year_id, status, created_at")
    .eq("year_id", yearId)
    .order("created_at", {
      ascending: false,
    });

  if (yearsAccessError) {
    throw new AppError(
      "Failed to fetch year access data",
      ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
      500,
    );
  }

  if (!yearsAccessData || yearsAccessData.length === 0) {
    return { pending: [], approved: [], rejected: [] };
  }

  const allUsers = await getAllAppUsers();

  const usersMap = new Map(
    allUsers.map((user) => [
      user.id,
      {
        email: user.email ?? null,
        name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      },
    ]),
  );

  const pendingRequests: YearAccessPendingEntry[] = [];
  const approvedRequests: YearAccessEntry[] = [];
  const rejectedRequests: YearAccessRejectedEntry[] = [];

  const rejectionMap = new Map<
    string,
    { count: number; addedToList: boolean }
  >();
  for (const record of yearsAccessData) {
    if (record.status === YearAccessStatus.REJECTED) {
      const existing = rejectionMap.get(record.user_id);

      if (existing) {
        existing.count += 1;
      } else {
        rejectionMap.set(record.user_id, { count: 1, addedToList: false });
      }
    }
  }

  for (const accessData of yearsAccessData) {
    const userData = usersMap.get(accessData.user_id);

    const rejectionInfo = rejectionMap.get(accessData.user_id);

    if (accessData.status === YearAccessStatus.PENDING) {
      pendingRequests.push({
        id: accessData.id,
        user_id: accessData.user_id,
        year_id: accessData.year_id,
        status: YearAccessStatus.PENDING,
        name: userData?.name ?? null,
        email: userData?.email ?? null,
        previous_rejections: rejectionInfo?.count ?? 0,
      });
      continue;
    }

    if (accessData.status === YearAccessStatus.REJECTED) {
      if (rejectionInfo && !rejectionInfo.addedToList) {
        rejectedRequests.push({
          user_id: accessData.user_id,
          year_id: accessData.year_id,
          status: YearAccessStatus.REJECTED,
          name: userData?.name ?? null,
          email: userData?.email ?? null,
          rejection_count: rejectionInfo.count,
          last_rejected_at: accessData.created_at,
        });

        rejectionInfo.addedToList = true;
      }
      continue;
    }

    approvedRequests.push({
      id: accessData.id,
      user_id: accessData.user_id,
      year_id: accessData.year_id,
      status: YearAccessStatus.APPROVED,
      name: userData?.name ?? null,
      email: userData?.email ?? null,
    });
  }

  return {
    pending: pendingRequests,
    approved: approvedRequests,
    rejected: rejectedRequests,
  } as YearAccessRequestsResult;
};

export const removeYearAccess = async ({
  yearId,
  userId,
}: {
  yearId: string;
  userId: string;
}) => {
  const db = getSupabase();

  const [yearAccessCall, profilesCall] = await Promise.all([
    db
      .from(Table.YearAccess)
      .select("id, year_id, user_id, status")
      .eq("year_id", yearId)
      .eq("user_id", userId)
      .eq("status", YearAccessStatus.APPROVED)
      .maybeSingle(),
    db
      .from(Table.Profiles)
      .select("id, global_role")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (yearAccessCall.error) {
    throw new AppError(
      "Unable to fetch Year Access",
      ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
      500,
    );
  }

  if (profilesCall.error) {
    throw new AppError(
      "Fetching Profile failed",
      ERROR_CODES.PROFILE_LOOKUP_FAILED,
      500,
    );
  }

  if (!profilesCall.data) {
    throw new AppError("Profile not found", ERROR_CODES.PROFILE_NOT_FOUND, 404);
  }

  if (!yearAccessCall.data) {
    throw new AppError(
      "Year Access data not found",
      ERROR_CODES.YEAR_ACCESS_REQUEST_NOT_AVAILABLE,
      404,
    );
  }

  const userRole = profilesCall.data.global_role;

  if (userRole === Role.Admin || userRole === Role.Superadmin) {
    throw new AppError("Wrong Profile Selected", ERROR_CODES.FORBIDDEN, 403);
  }

  const { error: updateError } = await db
    .from(Table.YearAccess)
    .update({ status: YearAccessStatus.REJECTED })
    .eq("id", yearAccessCall.data.id);

  if (updateError) {
    throw new AppError(
      "Year access removal failed",
      ERROR_CODES.YEAR_ACCESS_REQUEST_REJECT_FAILED,
      500,
    );
  }

  if (userRole === Role.Viewer) {
    return true;
  }

  const { data: yearParticipantData, error: yearParticipantError } = await db
    .from(Table.YearParticipants)
    .select(`id, email, year_id, user_id, ${Table.TeamMemberships}(id)`)
    .eq("user_id", profilesCall.data.id)
    .eq("year_id", yearAccessCall.data.year_id)
    .maybeSingle();

  if (yearParticipantError) {
    throw new AppError(
      "Year Participant details fetch failed",
      ERROR_CODES.YEAR_PARTICIPANT_FETCH_FAILED,
      500,
    );
  }

  if (!yearParticipantData) {
    if (userRole === Role.User) {
      return true;
    }
    return false;
  }

  if (yearParticipantData.team_memberships?.[0]?.id) {
    const { error } = await db
      .from(Table.TeamMemberships)
      .delete()
      .eq("id", yearParticipantData.team_memberships[0].id);

    if (error)
      throw new AppError(
        "Team membership deletion failed",
        ERROR_CODES.TEAM_MEMBERSHIP_UPDATE_FAILED,
        500,
      );
  }

  const { error: participantDeleteError } = await db
    .from(Table.YearParticipants)
    .delete()
    .eq("id", yearParticipantData.id);

  if (participantDeleteError)
    throw new AppError(
      "Participant Deletion Failed",
      ERROR_CODES.YEAR_PARTICIPANT_DELETION_FAILED,
      500,
    );

  return true;
};

export const getAllYearAccessProfiles = async ({
  yearId,
}: {
  yearId: string;
}) => {
  const db = getSupabase();

  const { data: yearAccessData, error: yearAccessError } = await db
    .from(Table.YearAccess)
    .select("user_id")
    .eq("year_id", yearId)
    .eq("status", YearAccessStatus.APPROVED);

  if (yearAccessError) {
    throw new AppError(
      "Unable to fetch year access",
      ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
      500,
    );
  }

  if (!yearAccessData || yearAccessData.length === 0) {
    return [];
  }

  const userIds = yearAccessData.map(
    (yearAccess) => yearAccess.user_id,
  ) as string[];

  const [profilesFetch, allUsers] = await Promise.all([
    db.from(Table.Profiles).select("id, global_role").in("id", userIds),
    getAllAppUsers(true),
  ]);

  if (profilesFetch.error) {
    throw new AppError(
      "Unable to fetch users with year access",
      ERROR_CODES.USERS_FETCH_FAILED,
      500,
    );
  }

  if (profilesFetch.data.length === 0 || allUsers.length === 0) {
    return [];
  }

  const usersMap = new Map<
    string,
    { id: string; role: string; email?: string; name?: string }
  >();

  profilesFetch.data.forEach((user) => {
    if (!usersMap.has(user.id)) {
      usersMap.set(user.id, {
        id: user.id as string,
        role: user.global_role as string,
      });
    }
  });

  allUsers.forEach((user) => {
    if (usersMap.has(user.id)) {
      const userData = usersMap.get(user.id);

      if (userData) {
        usersMap.set(user.id, {
          ...userData,
          email: user?.email,
          name: user.user_metadata?.full_name ?? user.user_metadata?.name,
        });
      }
    }
  });

  const usersList = usersMap.values();

  return Array.from(usersList);
};
