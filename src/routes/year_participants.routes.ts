import { CsvParseStream } from "@std/csv/parse-stream";
import { Hono } from "hono";
import { ERROR_CODES } from "@/constants/error-codes.ts";
import {
  loadProfile,
  requireRole,
  requireYearAccess,
  supabaseAuth,
} from "@/middleware";
import {
  getYearParticipantsQuerySchema,
  yearParticipantsBanParamsSchema,
  yearParticipantsParamsSchema,
  yearParticipantsSchema,
  yearParticipantsUnbanParamsSchema,
  yearParticipantsUnbanQuerySchema,
} from "@/schemas/year_participants.schema.ts";
import {
  addYearParticipant,
  banParticipant,
  bulkAddYearParticipants,
  disqualifyParticipant,
  getYearsParticipants,
  unbanParticipant,
  undisqualifyParticipant,
} from "@/services";
import { type AppContext, Role } from "@/types";
import { AppError } from "@/utils/error.ts";
import { getValidated, validate } from "@/utils/validate.ts";

const yearsParticipantRouter = new Hono<AppContext>();

yearsParticipantRouter.post(
  "/",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearParticipantsParamsSchema),
  validate("json", yearParticipantsSchema),
  async (c) => {
    const { yearId } = getValidated(c, "param", yearParticipantsParamsSchema);
    const participantData = getValidated(c, "json", yearParticipantsSchema);

    const addedParticipant = await addYearParticipant({
      yearId,
      ...participantData,
    });

    return c.json(
      {
        participantData: addedParticipant.participant,
        ...(addedParticipant.disqualifiedDetails
          ? {
              warning: `The participant ${addedParticipant.disqualifiedDetails.name} with email ${addedParticipant.disqualifiedDetails.email} was disqualified the last time they volunteered.`,
            }
          : {}),
      },
      201,
    );
  },
);

yearsParticipantRouter.post(
  "/bulk",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearParticipantsParamsSchema),
  async (c) => {
    const { yearId } = getValidated(c, "param", yearParticipantsParamsSchema);

    const formData = await c.req.formData();

    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      throw new AppError(
        "Invalid file upload",
        ERROR_CODES.INVALID_FILE_UPLOAD,
        422,
      );
    }

    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      throw new AppError(
        "Invalid file type. Only CSV files are allowed.",
        ERROR_CODES.INVALID_FILE_UPLOAD,
        422,
      );
    }

    const csvStream = file
      .stream()
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new CsvParseStream({ skipFirstRow: true }));

    const records = await Array.fromAsync(csvStream);

    const results = await bulkAddYearParticipants({ yearId, rows: records });

    return c.json(results, 207);
  },
);

yearsParticipantRouter.get(
  "/",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Viewer),
  requireYearAccess,
  validate("param", yearParticipantsParamsSchema),
  validate("query", getYearParticipantsQuerySchema),
  async (c) => {
    const { yearId } = getValidated(c, "param", yearParticipantsParamsSchema);

    const filters = getValidated(c, "query", getYearParticipantsQuerySchema);

    const userId = c.get("userId");
    const role = c.get("profile").global_role as Role;

    const { participants, total, page, pageSize } = await getYearsParticipants({
      yearId,
      filters,
      userId,
      role,
    });

    return c.json({
      participants,
      total,
      page,
      pageSize,
    });
  },
);

yearsParticipantRouter.patch(
  "/:participantId/ban",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearParticipantsBanParamsSchema),
  async (c) => {
    const params = getValidated(c, "param", yearParticipantsBanParamsSchema);

    const result = await banParticipant(params);

    if (result.account_disabled && !result.db_updated) {
      return c.json(
        {
          status: "partial_success",
          message:
            "Account disabled in Auth, but DB update failed. Manual intervention required.",
          details: result,
        },
        207,
      );
    }

    return c.json(result.data, 200);
  },
);

yearsParticipantRouter.patch(
  "/:participantId/unban",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearParticipantsUnbanParamsSchema),
  validate("query", yearParticipantsUnbanQuerySchema),
  async (c) => {
    const params = getValidated(c, "param", yearParticipantsUnbanParamsSchema);
    const query = getValidated(c, "query", yearParticipantsUnbanQuerySchema);

    const result = await unbanParticipant({
      ...params,
      restoreCompleteAccess: query.restoreAuth,
    });

    if (result.auth_restored && !result.db_updated) {
      return c.json(
        {
          status: "partial_success",
          message:
            "Auth restored, but DB update failed. Manual intervention required to restore participant access.",
          details: result,
        },
        207,
      );
    }

    return c.json(result.data, 200);
  },
);

yearsParticipantRouter.patch(
  "/:participantId/disqualify",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearParticipantsBanParamsSchema),
  async (c) => {
    const params = getValidated(c, "param", yearParticipantsBanParamsSchema);

    const result = await disqualifyParticipant(params);

    return c.json(result, 200);
  },
);

yearsParticipantRouter.patch(
  "/:participantId/undisqualify",
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate("param", yearParticipantsBanParamsSchema),
  async (c) => {
    const params = getValidated(c, "param", yearParticipantsBanParamsSchema);

    const result = await undisqualifyParticipant(params);

    return c.json(result, 200);
  },
);

export default yearsParticipantRouter;
