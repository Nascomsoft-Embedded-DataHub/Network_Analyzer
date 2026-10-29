import { buildApp } from './app.js';
import { corsOrigins, exposureWarning } from './config.js';
import { IngestionListener } from './ingestion/listener.js';
import { createDiscoverySources } from './ingestion/sources.js';

async function main(): Promise<void> {
  const { app, config, db } = await buildApp();

  const sources = createDiscoverySources(config, (message) => app.log.warn(message));
  const listener = new IngestionListener({
    db,
    sources,
    pollIntervalMs: config.DISCOVERY_POLL_INTERVAL_SECONDS * 1000,
    offlineAfterMs: config.DISCOVERY_OFFLINE_AFTER_SECONDS * 1000,
    logger: {
      info: (message) => app.log.info(message),
      warn: (message) => app.log.warn(message),
      error: (message, error) => app.log.error({ err: error }, message),
    },
  });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    app.log.info(`Network Analyser API listening on ${config.HOST}:${config.PORT}`);
    app.log.info(`CORS origins: ${corsOrigins(config).join(', ')}`);

    const warning = exposureWarning(config);
    if (warning) {
      app.log.warn(warning);
    }

    if (sources.length > 0) {
      for (const source of sources) {
        app.log.info(`discovery source: ${source.name} — ${source.description}`);
      }
      listener.start();
    } else {
      app.log.warn('no discovery sources are enabled; the inventory will stay empty');
    }

    const shutdown = async (signal: string): Promise<void> => {
      app.log.info(`${signal} received; shutting down`);
      await listener.stop();
      await app.close();
      await db.pool.end();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
