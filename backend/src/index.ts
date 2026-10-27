import { buildApp } from './app.js';
import { corsOrigins } from './config.js';

async function main(): Promise<void> {
  const { app, config } = await buildApp();

  try {
    await app.listen({ host: config.HOST, port: config.PORT });
    app.log.info(`Network Analyser API listening on ${config.HOST}:${config.PORT}`);
    app.log.info(`CORS origins: ${corsOrigins(config).join(', ')}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
