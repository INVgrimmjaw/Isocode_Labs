import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '#shared/api';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let status = 500;
  let body: ApiErrorBody = {
    error: { code: 'INTERNAL', message: 'Something went wrong on our side.' },
  };

  if (err instanceof AppError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: 'VALIDATION',
        message: 'Some of the details sent were not valid.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  } else if (isClientBodyError(err)) {
    status = err.status;
    body = { error: { code: 'BAD_REQUEST', message: 'The request could not be read.' } };
  } else {
    console.error(err);
  }
  res.status(status).json(body);
};

/** Malformed or oversized JSON, raised by express.json() before any route runs. */
function isClientBodyError(err: unknown): err is { status: number } {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && status >= 400 && status < 500;
}
