import type { MiddlewareHandler, Next } from "hono";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import { verifySupabaseJWT } from "@/lib";
import type { AppContext } from "@/types";
import { AppError, getErrorMessage } from "@/utils/error.ts";

export const supabaseAuth: MiddlewareHandler<AppContext> = async (
  c,
  next: Next,
) => {
  const auth = c.req.header("Authorization");

  if (!auth?.startsWith("Bearer ")) {
    throw new AppError("Missing token", ERROR_CODES.UNAUTHORIZED, 401);
  }

  const token = auth.slice(7);

  try {
    const payload = await verifySupabaseJWT(token);

    if (!payload.sub) {
      throw new AppError("Invalid token", ERROR_CODES.UNAUTHORIZED, 401);
    }

    c.set("userId", payload.sub);

    const email = (payload.email as string) ?? null;
    const name =
      (payload.user_metadata as Record<string, string>)?.full_name ??
      (payload.user_metadata as Record<string, string>)?.name ??
      null;

    c.set("name", name);
    c.set("email", email);

    await next();
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error("JWT verify failed:", getErrorMessage(err));
    throw new AppError(
      "Invalid or expired token",
      ERROR_CODES.UNAUTHORIZED,
      401,
    );
  }
};
