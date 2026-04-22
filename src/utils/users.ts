import { ERROR_CODES } from "@/constants/error-codes.ts";
import { getSupabase } from "@/lib";
import { AppError } from "./error.ts";

export const getAllAppUsers = async (allowNoUsers: boolean = false) => {
  const db = getSupabase();

  const {
    data: { users: allUsers },
    error: userListError,
  } = await db.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (userListError) {
    throw new AppError(
      "Failed to fetch all users",
      ERROR_CODES.APP_USERS_FETCH_FAILED,
      500,
    );
  }

  if (!allUsers || allUsers.length === 0) {
    if (allowNoUsers) return [];

    throw new AppError(
      "List of all users is unavailable",
      ERROR_CODES.APP_USERS_NOT_FOUND,
      404,
    );
  }

  return allUsers;
};
