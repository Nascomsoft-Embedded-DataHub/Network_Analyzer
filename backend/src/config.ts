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
  /**
   * Discovery sources the ingestion listener draws from.
   *
   * - `neighbour-cache` — the host operating system's ARP/neighbour cache.
   *   Reports true hardware addresses but only for devices this machine has
   *   actually spoken to.
   * - `starlink-router` — the router's own client roster, read over its local
   *   gRPC control plane. Reports every attached device, but masks the low
   *   three octets of each MAC down to the vendor OUI.
   * - `simulated` — a synthetic roster for demos and tests. Never enable this
   *   on a live network: it writes devices that do not exist.
   */
  DISCOVERY_SOURCES: z.string().default('neighbour-cache'),
  /** Seconds between discovery polls. */
  DISCOVERY_POLL_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(15),
  /**
   * Seconds of silence after which a device is marked offline.
   *
   * A device that misses one poll has usually merely changed band or slept,
   * so the grace period keeps a flaky poll from flapping the roster between
   * online and offline.
   */
  DISCOVERY_OFFLINE_AFTER_SECONDS: z.coerce.number().int().min(30).max(86400).default(180),
  /** Address of the Starlink router on the local network. */
  STARLINK_ROUTER_HOST: z.string().default('192.168.1.1'),
  /** Port of the router's local gRPC control plane. */
  STARLINK_ROUTER_PORT: z.coerce.number().int().min(1).max(65535).default(9000),
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

/** Discovery sources the ingestion listener should poll, in the order given. */
export function discoverySources(config: Config): string[] {
  return config.DISCOVERY_SOURCES.split(',')
    .map((source) => source.trim().toLowerCase())
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
