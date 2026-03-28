import { Hono } from 'hono';
import { CsvParseStream } from '@std/csv/parse-stream';

import {
  supabaseAuth,
  requireRole,
  loadProfile,
  requireYearAccess,
} from '@/middleware';
import {
  addYearParticipant,
  bulkAddYearParticipants,
  getYearsParticipants,
} from '@/services';
import {
  yearParticipantsSchema,
  yearParticipantsParamsSchema,
  getYearParticipantsQuerySchema,
} from '@/schemas/year_participants.schema.ts';
import { validate, getValidated } from '@/utils/validate.ts';
import { AppError } from '@/utils/error.ts';

import { ERROR_CODES } from '@/constants/error-codes.ts';

import { type AppContext, Role } from '@/types';

const yearsParticipantRouter = new Hono<AppContext>();

yearsParticipantRouter.post(
  '/',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate('param', yearParticipantsParamsSchema),
  validate('json', yearParticipantsSchema),
  async (c) => {
    const { yearId } = getValidated(c, 'param', yearParticipantsParamsSchema);
    const participantData = getValidated(c, 'json', yearParticipantsSchema);

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
  '/bulk',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Admin),
  validate('param', yearParticipantsParamsSchema),
  async (c) => {
    const { yearId } = getValidated(c, 'param', yearParticipantsParamsSchema);

    const formData = await c.req.formData();

    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      throw new AppError(
        'Invalid file upload',
        ERROR_CODES.INVALID_FILE_UPLOAD,
        422,
      );
    }

    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      throw new AppError(
        'Invalid file type. Only CSV files are allowed.',
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
  '/',
  supabaseAuth,
  loadProfile,
  requireRole(Role.Viewer),
  requireYearAccess,
  validate('param', yearParticipantsParamsSchema),
  validate('query', getYearParticipantsQuerySchema),
  async (c) => {
    const { yearId } = getValidated(c, 'param', yearParticipantsParamsSchema);

    const filters = getValidated(c, 'query', getYearParticipantsQuerySchema);

    const userId = c.get('userId');
    const role = c.get('profile').global_role as Role;

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

export default yearsParticipantRouter;
