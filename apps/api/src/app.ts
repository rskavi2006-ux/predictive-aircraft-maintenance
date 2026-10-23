import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import { alertsRouter } from './modules/alerts/alerts.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { componentsRouter } from './modules/components/components.routes.js';
import { fleetRouter } from './modules/fleet/fleet.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import type { Check } from './modules/health/health.service.js';
import { scoringRouter } from './modules/scoring/scoring.routes.js';
import { telemetryRouter } from './modules/telemetry/telemetry.routes.js';
import { schedulingRouter } from './modules/scheduling/scheduling.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { workOrdersRouter } from './modules/workorders/workorders.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

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
  app.use('/api/v1/auth', authRouter());
  app.use('/api/v1/users', usersRouter());
  app.use('/api/v1/audit', auditRouter());
  app.use('/api/v1/aircraft', fleetRouter());
  app.use('/api/v1/components', componentsRouter());
  app.use('/api/v1/telemetry', telemetryRouter());
  app.use('/api/v1/health-scores', scoringRouter());
  app.use('/api/v1/alerts', alertsRouter());
  app.use('/api/v1/tasks', tasksRouter());
  app.use('/api/v1/scheduling', schedulingRouter());
  app.use('/api/v1/work-orders', workOrdersRouter());

  app.use(notFound);
  app.use(errorHandler(deps.logger));
  return app;
}