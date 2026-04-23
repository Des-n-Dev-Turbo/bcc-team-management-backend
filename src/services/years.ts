import { MAX_YEAR_REQUEST_ATTEMPTS, Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib/supabase.ts";
import { hasRequiredRole, Role, YearAccessStatus } from "@/types";
import { AppError } from "@/utils/error.ts";
import { validateYear } from "@/utils/years.ts";

export const createYear = async ({
  name,
  year,
}: {
  name: string;
  year: number;
}) => {
  const db = getSupabase();

  const { data: fetchUnlockedYears, error: fetchUnlockedYearsError } = await db
    .from(Table.Years)
    .select("id, name, year")
    .or("is_locked.eq.false,is_locked.is.null");

  if (fetchUnlockedYearsError) {
    throw new AppError(
      "Unable to access the Years",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (fetchUnlockedYears?.length) {
    throw new AppError(
      "Cannot create a new year while unlocked years exist",
      ERROR_CODES.YEAR_CREATION_BLOCKED,
      409,
      {
        unlocked_years: fetchUnlockedYears,
      },
    );
  }

  const { data: newYear, error: insertError } = await db
    .from(Table.Years)
    .insert({
      name,
      year,
      is_locked: false,
    })
    .select("id, name, year, is_locked")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      throw new AppError(
        "Year already exists",
        ERROR_CODES.DUPLICATE_YEAR,
        409,
      );
    }

    throw new AppError(
      "Failed to create year",
      ERROR_CODES.CREATE_YEAR_FAILED,
      500,
    );
  }

  const { data: previousYear } = await db
    .from(Table.Years)
    .select("id")
    .neq("id", newYear.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { createdYear: newYear, previousYearId: previousYear?.id ?? null };
};

export const lockYear = async (year: string) => {
  const db = getSupabase();

  await validateYear({
    yearId: year,
    yearLockedErrorMessage: "Year is already locked",
  });

  const { data: lockedYear, error: lockedYearError } = await db
    .from(Table.Years)
    .update({ is_locked: true })
    .eq("id", year)
    .select("id, is_locked, name, year")
    .single();

  if (lockedYearError) {
    throw new AppError(
      "Failed to lock year",
      ERROR_CODES.LOCK_YEAR_FAILED,
      500,
    );
  }

  return lockedYear;
};

export const getYears = async ({
  userId,
  role,
}: {
  userId: string;
  role: Role;
}) => {
  const db = getSupabase();

  const { data: years, error: yearsError } = await db
    .from(Table.Years)
    .select("id, name, year, is_locked");

  if (yearsError) {
    throw new AppError(
      "Failed to fetch years",
      ERROR_CODES.YEAR_FETCH_FAILED,
      500,
    );
  }

  if (hasRequiredRole(role, Role.Admin)) {
    return years.map((year) => ({
      id: year.id,
      name: year.name,
      is_locked: year.is_locked,
      year: year.year,
      can_access: true,
      status: YearAccessStatus.APPROVED,
      requests_available: null,
    }));
  }

  const { data: yearAccessData, error: yearAccessError } = await db
    .from(Table.YearAccess)
    .select()
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (yearAccessError) {
    throw new AppError(
      "Failed to fetch year access data",
      ERROR_CODES.YEAR_ACCESS_FETCH_FAILED,
      500,
    );
  }

  const yearData = years.map((year) => {
    const accessRecord = yearAccessData.filter(
      (record) => record.year_id === year.id,
    );

    const latestAccessRecord = accessRecord.length > 0 ? accessRecord[0] : null;

    return {
      id: year.id,
      name: year.name,
      is_locked: year.is_locked,
      year: year.year,
      can_access: latestAccessRecord?.status === YearAccessStatus.APPROVED,
      status: (latestAccessRecord?.status as YearAccessStatus) ?? null,
      requests_available: Math.max(
        0,
        MAX_YEAR_REQUEST_ATTEMPTS - accessRecord.length,
      ),
    };
  });

  return yearData;
};
