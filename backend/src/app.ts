import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { corsOrigins, loadConfig, type Config } from './config.js';
import { createDatabase, type Database } from './db/client.js';
import { registerErrorHandler } from './http/errors.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerUsageRoutes } from './routes/usage.js';

export interface BuildAppOptions {
  config?: Config;
  db?: Database;
}

export interface App {
  app: FastifyInstance;
  db: Database;
  config: Config;
}

/**
 * Assembles the Fastify application with CORS, the error envelope and every
 * route group. The database handle can be injected so tests can substitute
 * their own.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<App> {
  const config = options.config ?? loadConfig();
  const db = options.db ?? createDatabase(config.DATABASE_URL);

  const app = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  await app.register(cors, {
    origin: corsOrigins(config),
    credentials: true,
  });

  registerErrorHandler(app);

  app.get('/api/health-check', async () => ({ status: 'ok' }));

  await registerDeviceRoutes(app, db);
  await registerUsageRoutes(app, db);
  await registerHealthRoutes(app, db);
  await registerAlertRoutes(app, db);

  return { app, db, config };
}
