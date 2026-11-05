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
 * needs a way to confirm it is talking to the right instance. That check
 * happens before anybody signs in — the address can be wrong, and the sign-in
 * screen is where the address is corrected — so this route is public.
 *
 * What it reveals is deliberately thin: the hostname, the runtime and how the
 * analyser is bound. Nothing about the devices on the network, which is what
 * the session guards.
 */
export async function registerSystemRoutes(
  app: FastifyInstance,
  config: Config,
  startedAt: Date,
): Promise<void> {
  app.get('/api/system/info', { config: { public: true } }, async () => {
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
