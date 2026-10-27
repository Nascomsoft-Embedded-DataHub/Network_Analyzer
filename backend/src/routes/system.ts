import os from 'node:os';
import { SystemInfoResponseSchema } from '@network-analyser/contracts';
import type { FastifyInstance } from 'fastify';
import { isLoopback, type Config } from '../config.js';

/** Version of the analyser build, kept in step with the package version. */
export const VERSION = '0.1.0';

/**
 * Reports which machine the analyser is running on.
 *
 * The dashboard may be open on a different device than the analyser, so it
 * needs a way to confirm it is talking to the right instance.
 */
export async function registerSystemRoutes(
  app: FastifyInstance,
  config: Config,
  startedAt: Date,
): Promise<void> {
  app.get('/api/system/info', async () => {
    return SystemInfoResponseSchema.parse({
      data: {
        version: VERSION,
        startedAt: startedAt.toISOString(),
        uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        bindHost: config.HOST,
        bindPort: config.PORT,
        hostname: os.hostname(),
        runtime: {
          nodeVersion: process.version,
          platform: `${process.platform} ${process.arch}`,
        },
        loopbackOnly: isLoopback(config.HOST),
      },
    });
  });
}
