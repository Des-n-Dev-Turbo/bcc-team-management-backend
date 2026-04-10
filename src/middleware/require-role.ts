import type { MiddlewareHandler, Next } from "hono";

import { ERROR_CODES } from "@/constants/error-codes.ts";
import { type AppContext, hasRequiredRole, type Role } from "@/types";
import { AppError } from "@/utils/error.ts";

export const requireRole = (
  requiredRole: Role,
): MiddlewareHandler<AppContext> => {
  return async (c, next: Next) => {
    const profile = c.get("profile");

    if (!profile) {
      throw new AppError(
        "Profile not loaded",
        ERROR_CODES.PROFILE_NOT_FOUND,
        500,
      );
    }

    const userRole = profile.global_role as Role;

    if (!hasRequiredRole(userRole, requiredRole)) {
      throw new AppError("Forbidden", ERROR_CODES.FORBIDDEN, 403);
    }

    await next();
  };
};
