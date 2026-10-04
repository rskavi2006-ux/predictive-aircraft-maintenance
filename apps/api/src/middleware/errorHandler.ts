import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} not found`));
};

// Central error handler. Format: { error: { code, message, details } }
export const errorHandler =
  (logger: Logger): ErrorRequestHandler =>
  (err, _req, res, next) => {
    if (res.headersSent) return next(err);

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong';
    let details: unknown;

    const httpStatus = (err as { status?: unknown }).status;
    if (err instanceof AppError) {
      ({ status, code, message, details } = err);
    } else if (err instanceof ZodError) {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = 'Request validation failed';
      details = err.issues;
    } else if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
      // e.g. malformed JSON body from express.json()
      status = httpStatus;
      code = 'BAD_REQUEST';
      message = err instanceof Error ? err.message : 'Bad request';
    }

    if (status >= 500) logger.error({ err, requestId: res.locals.requestId }, 'unhandled error');
    res.status(status).json({ error: { code, message, details } });
  };