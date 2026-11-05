import { z } from 'zod';

/**
 * An optional string variable.
 *
 * An environment file that says `ANALYSER_ADMIN_PASSWORD=` means "no
 * password", not "a password of zero characters" — so an empty value is
 * treated as an absent one rather than failing the minimum-length check.
 */
const optionalString = (min: number) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value))
    .refine((value) => value === undefined || value.length >= min, {
      message: `Must be at least ${min} characters.`,
    });

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
   * machine, so binding the LAN interface is an explicit opt-in — it is what
   * lets a phone on the same network reach the dashboard, and sessions are
   * what make that safe. See `docs/adr/0001-deployment-model.md`.
   */
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /**
   * PostgreSQL connection string.
   *
   * The default points at 5433, which is where the local development
   * database runs — the CI runner reserves 5432 for its own PostgreSQL.
   */
  DATABASE_URL: z.url().default('postgresql://postgres:postgres@localhost:5433/network_analyser'),
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
  /**
   * Seconds between writes of the hourly usage buckets.
   *
   * The buckets themselves are hourly; this is how often the pending
   * traffic is handed over. Shorter intervals make the current hour appear
   * on the dashboard sooner, at the cost of more writes.
   */
  TELEMETRY_USAGE_FLUSH_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(3600).default(300),
  /**
   * Seconds between health samples.
   *
   * Each sample asks the router to run its own speed test, which is real
   * traffic on the link. A sample every five minutes is enough for the
   * dashboard without spending the link on measurement.
   */
  TELEMETRY_HEALTH_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
  /**
   * Days of hourly usage rollups to keep.
   *
   * Seven days is the window the consumption dashboards cover, and the
   * privacy directives allow exactly that long.
   */
  TELEMETRY_USAGE_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Days of health samples to keep. */
  TELEMETRY_HEALTH_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  /** Seconds between retention sweeps. */
  TELEMETRY_RETENTION_INTERVAL_SECONDS: z.coerce.number().int().min(300).max(86400).default(3600),
  /**
   * Address of the administrator account.
   *
   * The analyser keeps its accounts in configuration rather than in a user
   * table: there is one administrator and, optionally, one read-only viewer.
   */
  ANALYSER_ADMIN_EMAIL: z.email().default('admin@analyser.local'),
  /**
   * Password of the administrator account.
   *
   * Without it the analyser still runs and still serves the sign-in screen,
   * but nobody can sign in — the dashboard says so rather than rejecting
   * every attempt as though the password were wrong.
   */
  ANALYSER_ADMIN_PASSWORD: optionalString(8),
  /** Address of the optional read-only account. */
  ANALYSER_VIEWER_EMAIL: z.email().optional(),
  /** Password of the optional read-only account. */
  ANALYSER_VIEWER_PASSWORD: optionalString(8),
  /**
   * Secret used to sign session tokens.
   *
   * Without it a random one is generated at boot, which signs sessions that
   * stop working when the analyser restarts. That is the safe direction to
   * fail, but a stable secret means a phone keeps its session across a
   * restart, which is what an administrator actually wants.
   */
  ANALYSER_SESSION_SECRET: optionalString(16),
  /** How long a session lasts, in hours. */
  ANALYSER_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
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
 * Sessions now protect the device inventory, so binding to the LAN is a
 * supported way to run the analyser: the phone on the same network signs in
 * like any other client. What remains is worth saying out loud, because
 * "authentication" is not the same as "private" — every device on the
 * network can still reach the sign-in screen and try to authenticate against
 * it.
 */
export function exposureWarning(config: Config): string | null {
  if (isLoopback(config.HOST)) return null;
  return (
    `API is bound to ${config.HOST} and is reachable by other devices on this network. ` +
    `Session authentication protects the device inventory, so only a signed-in administrator ` +
    `or viewer can read it — but every device on the network can still reach the sign-in ` +
    `screen and attempt to authenticate. Keep the administrator password strong, and keep the ` +
    `analyser on a network you trust.`
  );
}
