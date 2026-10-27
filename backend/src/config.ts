import { z } from 'zod';

/**
 * Runtime configuration, validated at boot so a missing or malformed
 * variable fails fast rather than surfacing as a confusing runtime error.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Interface the API binds to.
   *
   * Defaults to loopback. The analyser runs on the administrator's own
   * machine, so binding the LAN interface is an explicit opt-in — and it is
   * only safe once authentication is in place, because the device inventory
   * is sensitive. See `docs/adr/0001-deployment-model.md`.
   */
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url().default('postgresql://postgres:postgres@localhost:5432/network_analyser'),
  /** Comma-separated list of origins allowed to call the API. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
});

export type Config = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return EnvSchema.parse(env);
}

/** Origins permitted by the CORS plugin. */
export function corsOrigins(config: Config): string[] {
  return config.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * True when the API is reachable only from the machine it runs on.
 */
export function isLoopback(host: string): boolean {
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host.startsWith('127.')
  );
}

/**
 * Warning to surface when the API is exposed beyond the local machine.
 *
 * Session authentication lands in a later sprint phase. Until then, exposing
 * the API on the LAN means any device on the network can enumerate every
 * device attached to it.
 */
export function exposureWarning(config: Config): string | null {
  if (isLoopback(config.HOST)) return null;
  return (
    `API is bound to ${config.HOST} and is reachable by other devices on this network. ` +
    `Session authentication is not implemented yet, so anyone on the network can read the ` +
    `device inventory and usage history. Keep the analyser on a trusted network until ` +
    `authentication lands.`
  );
}
