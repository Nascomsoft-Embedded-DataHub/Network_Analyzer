import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { createAuthGuard } from './auth/guard.js';
import { randomSessionSecret, SessionService } from './auth/session.js';
import { corsOrigins, loadConfig, type Config } from './config.js';
import { createDatabase, type Database } from './db/client.js';
import { registerErrorHandler } from './http/errors.js';
import { registerAlertRuleRoutes } from './routes/alertRules.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerUsageRoutes } from './routes/usage.js';

export interface BuildAppOptions {
  config?: Config;
  db?: Database;
  /** Overrides the session secret, so tests can sign known tokens. */
  sessionSecret?: string;
}

export interface App {
  app: FastifyInstance;
  db: Database;
  config: Config;
  /** The session service the API signs and verifies tokens with. */
  sessions: SessionService;
}

/**
 * Assembles the Fastify application with CORS, the error envelope, the
 * session guard and every route group. The database handle can be injected so
 * tests can substitute their own.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  const config = options.config ?? loadConfig();
  const db = options.db ?? createDatabase(config.DATABASE_URL);

  const sessions = new SessionService({
    adminEmail: config.ANALYSER_ADMIN_EMAIL,
    adminPassword: config.ANALYSER_ADMIN_PASSWORD,
    viewerEmail: config.ANALYSER_VIEWER_EMAIL,
    viewerPassword: config.ANALYSER_VIEWER_PASSWORD,
    // A stable secret keeps a phone's session alive across a restart of the
    // analyser. Without one, a random secret is generated and every token
    // stops working the moment the process does.
    secret: options.sessionSecret ?? config.ANALYSER_SESSION_SECRET ?? randomSessionSecret(),
    ttlHours: config.ANALYSER_SESSION_TTL_HOURS,
  });

  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: corsOrigins(config),
    credentials: true,
    // The dashboard sends the session token on every call, so the browser has
    // to be allowed to send the Authorization header on a cross-origin
    // request.
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  registerErrorHandler(app);

  // The identity the guard resolved for this request. Decorated up front so
  // assigning it costs nothing on the hot path.
  app.decorateRequest('auth', null);

  // The guard runs on `onRequest`, before any handler and before the body is
  // parsed, so an unauthenticated caller cannot make the analyser work.
  app.addHook('onRequest', createAuthGuard(sessions));

  app.get('/api/health-check', { config: { public: true } }, async () => ({ status: 'ok' }));

  await registerAuthRoutes(app, sessions);
  await registerSystemRoutes(app, config, new Date());
  await registerDeviceRoutes(app, db);
  await registerUsageRoutes(app, db);
  await registerHealthRoutes(app, db);
  await registerAlertRoutes(app, db);
  await registerAlertRuleRoutes(app, db);
  await registerReportRoutes(app, db, config);

  return { app, db, config, sessions };
}
