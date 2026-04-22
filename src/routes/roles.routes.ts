import { Hono } from "hono";
import { RolesRoutes } from "@/constants/routes.ts";
import { loadProfile, requireRole, supabaseAuth } from "@/middleware";
import {
  usersRoleChangeBodySchema,
  usersRoleChangeParamsSchema,
} from "@/schemas/roles.schema.ts";
import { getAppUsers, updateUserRole } from "@/services/roles.ts";
import { type AppContext, Role } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const router = new Hono<AppContext>();

router.get(
  RolesRoutes.GetUsers,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  async (c) => {
    const { global_role: userRole } = c.get("profile");

    const result = await getAppUsers({ userRole });

    return c.json({ result });
  },
);

router.patch(
  RolesRoutes.ChangeRole,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", usersRoleChangeParamsSchema),
  validate("json", usersRoleChangeBodySchema),
  async (c) => {
    const { currentRole, targetRole, profileId } = getValidated(
      c,
      "json",
      usersRoleChangeBodySchema,
    );

    const { global_role: userRole } = c.get("profile");

    const result = await updateUserRole({
      currentRole,
      targetRole,
      profileId,
      userRole,
    });

    return c.json({ result });
  },
);

export default router;
