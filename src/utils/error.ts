import { ErrorCode } from '../constants/error-codes.ts';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class AppError extends Error {
  code: ErrorCode;
  statusCode: ContentfulStatusCode;
  data: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: ContentfulStatusCode = 500,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
  }
}

type ErrorWithMessage = {
  message: string;
};

const isErrorWithMessage = (error: unknown): error is ErrorWithMessage => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
};

const toErrorWithMessage = (maybeError: unknown): ErrorWithMessage => {
  if (isErrorWithMessage(maybeError)) return maybeError;

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    return new Error(String(maybeError));
  }
};

export const getErrorMessage = (error: unknown) => {
  return toErrorWithMessage(error).message;
};
