import { Table } from "@/constants/common.ts";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { AppError } from "@/utils/error.ts";

interface MedalValues {
  gold: number;
  silver: number;
  bronze: number;
  bonus: number;
}

export const setYearScoresStandard = async ({
  yearId,
  values,
}: {
  yearId: string;
  values: MedalValues;
}) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from(Table.Years)
    .select("id, is_locked, gold, silver, bronze, bonus")
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
      "Cannot set scores standard for a locked year",
      ERROR_CODES.YEAR_ALREADY_LOCKED,
      409,
    );
  }

  const alreadySet =
    yearData.gold !== null &&
    yearData.silver !== null &&
    yearData.bronze !== null &&
    yearData.bonus !== null;

  if (alreadySet) {
    throw new AppError(
      "Scores standard is already set for this year",
      ERROR_CODES.YEAR_SCORES_STANDARD_ALREADY_SET,
      409,
    );
  }

  const { data: updatedYear, error: updateError } = await db
    .from(Table.Years)
    .update({
      gold: values.gold,
      silver: values.silver,
      bronze: values.bronze,
      bonus: values.bonus,
    })
    .eq("id", yearId)
    .select("id, gold, silver, bronze, bonus")
    .single();

  if (updateError) {
    throw new AppError(
      "Failed to set scores standard for year",
      ERROR_CODES.YEAR_SCORES_STANDARD_SET_FAILED,
      500,
    );
  }

  return updatedYear;
};

export const getYearScoresStandard = async ({ yearId }: { yearId: string }) => {
  const db = getSupabase();

  const { data: yearData, error: yearError } = await db
    .from(Table.Years)
    .select("id, gold, silver, bronze, bonus")
    .eq("id", yearId)
    .maybeSingle();

  if (yearError) {
    throw new AppError(
      "Failed to fetch year scores standard",
      ERROR_CODES.YEAR_SCORES_STANDARD_FETCH_FAILED,
      500,
    );
  }

  if (!yearData) {
    throw new AppError("Year not found", ERROR_CODES.YEAR_NOT_FOUND, 404);
  }

  const standardSet =
    yearData.gold !== null &&
    yearData.silver !== null &&
    yearData.bronze !== null &&
    yearData.bonus !== null;

  return {
    standardSet,
    scores: standardSet
      ? {
          gold: yearData.gold as number,
          silver: yearData.silver as number,
          bronze: yearData.bronze as number,
          bonus: yearData.bonus as number,
        }
      : null,
  };
};
