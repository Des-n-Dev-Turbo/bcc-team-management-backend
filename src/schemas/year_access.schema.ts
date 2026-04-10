import * as zod from "@zod/zod";

import { uuidSchema } from "./common.schema.ts";

export const requestYearAccessSchema = zod.object({
  yearId: uuidSchema,
});

export const approveRejectYearAccessSchema = zod.object({
  id: uuidSchema,
});
