import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

// Gives every request an ID (reuses a safe incoming X-Request-Id), echoes it in the
// response header, and logs one line per finished request.
export const requestContext =
  (logger: Logger): RequestHandler =>
  (req, res, next) => {
    const incoming = req.header('x-request-id');
    const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      logger.info(
        { requestId, method: req.method, url: req.originalUrl, status: res.statusCode, ms },
        'request',
      );
    });
    next();
  };