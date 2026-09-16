import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@lms/shared';

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: Pick<ApiError['error'], 'fields' | 'meta'>) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', 'The requested resource was not found.'));
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (res.headersSent) { _next(error); return; }
  let status = 500;
  let body: ApiError = { error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' } };

  if (error instanceof HttpError) {
    status = error.status;
    body = { error: { code: error.code, message: error.message, ...error.details } };
  } else if (error instanceof ZodError) {
    status = 422;
    const fields: Record<string, string[]> = {};
    for (const issue of error.issues) {
      const field = issue.path.join('.') || 'request';
      (fields[field] ??= []).push(issue.message);
    }
    body = { error: { code: 'VALIDATION_FAILED', message: 'Request validation failed.', fields } };
  } else if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      status = 400;
      body = { error: { code: 'MALFORMED_REQUEST', message: 'The request contains invalid JSON.' } };
    } else if (error.type === 'entity.too.large') {
      status = 413;
      body = { error: { code: 'REQUEST_TOO_LARGE', message: 'The request body is too large.' } };
    }
  }

  if (status === 500) console.error('Unexpected API error; request failed.');
  res.status(status).json(body);
};
