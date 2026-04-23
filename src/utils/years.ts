import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { AppError } from "./error.ts";

export const validateYear = async ({
  yearId,
  yearLockedErrorMessage,
}: {
  yearId: string;
  yearLockedErrorMessage?: string;
}) => {
  const db = getSupabase();
  const { data: yearData, error: yearError } = await db
    .from(Table.Years)
    .select("id, name, is_locked")
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
      yearLockedErrorMessage ?? "Cannot perform action for a locked year",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  return yearData;
};
