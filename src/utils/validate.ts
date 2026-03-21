import { zValidator } from '@hono/zod-validator';
import { type Context, type MiddlewareHandler } from 'hono';
import { type ZodType, z } from '@zod/zod';
import type { AppContext } from '@/types';
import { AppError } from '@/utils/error.ts';
import { ERROR_CODES } from '@/constants/error-codes.ts';

type ValidationTarget = 'json' | 'query' | 'param';

export const validate = (
  target: ValidationTarget,
  schema: ZodType,
): MiddlewareHandler<AppContext> => {
  return zValidator(target, schema, (result, _c) => {
    if (!result.success) {
      throw new AppError(
        result.error.issues[0]?.message ?? 'Validation failed',
        ERROR_CODES.VALIDATION_ERROR,
        422,
      );
    }
  }) as unknown as MiddlewareHandler<AppContext>;
};

export const getValidated = <T extends ZodType>(
  c: Context<AppContext>,
  target: ValidationTarget,
  _schema: T,
): z.infer<T> => {
  return c.req.valid(target as never) as z.infer<T>;
};
