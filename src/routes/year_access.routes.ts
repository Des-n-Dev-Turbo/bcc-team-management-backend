import { Hono } from "hono";
import { YearAccessRoutes } from "@/constants/routes.ts";
import { loadProfile, requireRole, supabaseAuth } from "@/middleware";
import {
  approveRejectYearAccessSchema,
  deleteYearAccessParamsSchema,
  deleteYearAccessQuerySchema,
  requestYearAccessSchema,
} from "@/schemas/year_access.schema.ts";
import {
  getAllYearAccessProfiles,
  getYearAccessRequests,
  removeYearAccess,
  requestYearAccess,
  updateYearAccess,
} from "@/services";
import { type AppContext, Role, YearAccessStatus } from "@/types";
import { getValidated, validate } from "@/utils/validate.ts";

const router = new Hono<AppContext>();

router.post(
  YearAccessRoutes.RequestAccess,
  supabaseAuth,
  loadProfile,
  validate("query", requestYearAccessSchema),
  async (c) => {
    const yearId = getValidated(c, "query", requestYearAccessSchema).yearId;

    const userId = c.get("userId");

    const result = await requestYearAccess({ yearId, userId });

    if (result) {
      return c.json(
        {
          message: "Access request submitted successfully.",
        },
        201,
      );
    }
  },
);

router.patch(
  YearAccessRoutes.Approve,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", approveRejectYearAccessSchema),
  async (c) => {
    const id = getValidated(c, "param", approveRejectYearAccessSchema).id;

    const status = YearAccessStatus.APPROVED;

    const result = await updateYearAccess({ id, status });

    if (result) {
      return c.json(
        {
          message: "Access request approved.",
        },
        200,
      );
    }
  },
);

router.patch(
  YearAccessRoutes.Reject,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", approveRejectYearAccessSchema),
  async (c) => {
    const id = getValidated(c, "param", approveRejectYearAccessSchema).id;

    const status = YearAccessStatus.REJECTED;

    const result = await updateYearAccess({ id, status });

    if (result) {
      return c.json(
        {
          message: "Access request rejected.",
        },
        200,
      );
    }
  },
);

router.get(
  YearAccessRoutes.GetAccessRequests,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("query", requestYearAccessSchema),
  async (c) => {
    const { yearId } = getValidated(c, "query", requestYearAccessSchema);

    const result = await getYearAccessRequests({ yearId });

    return c.json(result, 200);
  },
);

router.delete(
  YearAccessRoutes.Remove,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", deleteYearAccessParamsSchema),
  validate("query", deleteYearAccessQuerySchema),
  async (c) => {
    const { userId } = getValidated(c, "param", deleteYearAccessParamsSchema);

    const { yearId } = getValidated(c, "query", deleteYearAccessQuerySchema);

    const result = await removeYearAccess({ yearId, userId });

    return c.json(
      {
        message: result
          ? "Year access removed successfully"
          : "Year Participant was not found, Year access removed successfully",
      },
      200,
    );
  },
);

router.get(
  YearAccessRoutes.GetUsers,
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("query", deleteYearAccessQuerySchema),
  async (c) => {
    const { yearId } = getValidated(c, "query", deleteYearAccessQuerySchema);

    const result = await getAllYearAccessProfiles({ yearId });

    return c.json(result, 200);
  },
);

export default router;
