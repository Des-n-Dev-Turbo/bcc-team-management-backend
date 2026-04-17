import { Hono } from "hono";
import { RolesRoutes } from "@/constants/routes.ts";
import { loadProfile, requireRole, supabaseAuth } from "@/middleware";
import {
  usersRoleChangeBodySchema,
  usersRoleChangeParamsSchema,
} from "@/schemas/roles.schema.ts";
import { type AppContext, Role } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const router = new Hono<AppContext>();

router.get(
  RolesRoutes.GetUsers,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  async (c) => {},
);

router.patch(
  RolesRoutes.ChangeRole,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", usersRoleChangeParamsSchema),
  validate("json", usersRoleChangeBodySchema),
  async (c) => {
    const { userId } = getValidated(c, "param", usersRoleChangeParamsSchema);
    const { currentRole, targetRole } = getValidated(
      c,
      "json",
      usersRoleChangeBodySchema,
    );

    const { global_role: userRole } = c.get("profile");
  },
);

export default router;
