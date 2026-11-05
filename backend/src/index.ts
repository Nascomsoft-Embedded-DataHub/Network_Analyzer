import { buildApp } from './app.js';
import { corsOrigins, exposureWarning } from './config.js';
import { IngestionListener } from './ingestion/listener.js';
import { createDiscoverySources } from './ingestion/sources.js';
import { BandwidthCollector } from './telemetry/collector.js';
import { HealthSampler } from './telemetry/health.js';
import { RetentionSweeper } from './telemetry/retention.js';

async function main(): Promise<void> {
  const { app, config, db, sessions } = await buildApp();

  const logger = {
    info: (message: string) => app.log.info(message),
    warn: (message: string) => app.log.warn(message),
    error: (message: string, error?: unknown) => app.log.error({ err: error }, message),
  };

  const sources = createDiscoverySources(config, (message) => app.log.warn(message));

  const collector = new BandwidthCollector({ db, logger });
  const sampler = new HealthSampler({ db, sources, logger });
  const retention = new RetentionSweeper({
    db,
    usageRetentionDays: config.TELEMETRY_USAGE_RETENTION_DAYS,
    healthRetentionDays: config.TELEMETRY_HEALTH_RETENTION_DAYS,
    logger,
  });

  const listener = new IngestionListener({
    db,
    sources,
    pollIntervalMs: config.DISCOVERY_POLL_INTERVAL_SECONDS * 1000,
    offlineAfterMs: config.DISCOVERY_OFFLINE_AFTER_SECONDS * 1000,
    logger,
    trafficSink: collector,
  });

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    app.log.info(`Network Analyser API listening on ${config.HOST}:${config.PORT}`);
    app.log.info(`CORS origins: ${corsOrigins(config).join(', ')}`);

    const warning = exposureWarning(config);
    if (warning) {
      app.log.warn(warning);
    }

    if (!sessions.isConfigured()) {
      app.log.warn(
        'no administrator password is configured, so nobody can sign in; ' +
          'set ANALYSER_ADMIN_PASSWORD and restart the analyser to let a signed-in ' +
          'client read the inventory',
      );
    }

    if (sources.length > 0) {
      for (const source of sources) {
        app.log.info(`discovery source: ${source.name} — ${source.description}`);
      }
      listener.start();
    } else {
      app.log.warn('no discovery sources are enabled; the inventory will stay empty');
    }

    collector.start(config.TELEMETRY_USAGE_FLUSH_INTERVAL_SECONDS * 1000);
    app.log.info(
      `usage rollups are written every ${config.TELEMETRY_USAGE_FLUSH_INTERVAL_SECONDS}s ` +
        `and kept for ${config.TELEMETRY_USAGE_RETENTION_DAYS} days`,
    );

    if (sampler.sourceName) {
      app.log.info(`health samples will be taken from: ${sampler.sourceName}`);
      sampler.start(config.TELEMETRY_HEALTH_INTERVAL_SECONDS * 1000);
    } else {
      app.log.warn(
        'no discovery source can measure network health; the health page will stay empty',
      );
    }

    retention.start(config.TELEMETRY_RETENTION_INTERVAL_SECONDS * 1000);
    try {
      await retention.sweep();
    } catch (error) {
      logger.error('the retention sweep at startup failed', error);
    }

    const shutdown = async (signal: string): Promise<void> => {
      app.log.info(`${signal} received; shutting down`);
      await listener.stop();
      await sampler.stop();
      await collector.stop();
      await retention.stop();
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
