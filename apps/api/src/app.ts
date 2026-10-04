import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { healthRouter } from './modules/health/health.routes.js';
import type { Check } from './modules/health/health.service.js';

export interface AppDeps {
  logger: Logger;
  corsOrigins: string[];
  checks: Record<string, Check>;
  healthTimeoutMs?: number;
}

// App factory: dependencies are injected so tests can use fakes.
export function createApp(deps: AppDeps) {
  const app = express();
  app.use(requestContext(deps.logger));
  app.use(helmet());
  app.use(cors({ origin: deps.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', healthRouter(deps.checks, deps.healthTimeoutMs));

  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}