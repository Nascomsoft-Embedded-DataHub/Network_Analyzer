import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Devices observed on the monitored network.
 *
 * PRIVACY: Identity is limited to network-layer addressing. No user
 * accounts, no browsing history, no association to a natural person.
 */
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * Stable identity of the device within the analyser's records.
     *
     * Deliberately NOT the MAC address. A Starlink router masks the low three
     * octets of every MAC it reports and keeps only the vendor OUI, so three
     * bulbs from one vendor arrive wearing a single address. Keying the
     * inventory on the MAC would fold those devices into one row.
     *
     * The key records which identifier the row is anchored to, as
     * `<basis>:<value>`:
     *
     * - `mac:AA:BB:CC:DD:EE:FF` — a full hardware address, the strongest basis.
     * - `cid:<n>` — the router's own client id, for a device seen only through
     *   a router that masks its MACs.
     * - `ip:<address>` — the last resort, when neither of the above is known.
     *
     * A row's basis is upgraded in place when a stronger one is learned, so the
     * key never has to change to stay correct.
     */
    identityKey: text('identity_key').notNull(),
    /** Current IPv4 address. Changes on DHCP renewal. */
    ipAddress: text('ip_address').notNull(),
    /**
     * Normalised MAC address — the stable hardware identifier.
     *
     * Not unique, for the reason given on `identityKey`. On a masking router
     * this holds the vendor OUI with the remaining octets blanked, which is
     * the most that router is willing to say.
     *
     * Null for a device that has never been observed with a hardware address
     * at all, and is therefore known only by its network address.
     */
    macAddress: text('mac_address'),
    /** Friendly name produced by the discovery algorithm. */
    hostname: text('hostname'),
    /** OUI-derived hardware vendor. */
    vendor: text('vendor'),
    /** False until an administrator confirms the device as known. */
    isKnown: boolean('is_known').notNull().default(false),
    status: text('status').$type<'online' | 'offline' | 'unknown'>().notNull().default('unknown'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('devices_identity_key_key').on(table.identityKey),
    index('devices_mac_address_idx').on(table.macAddress),
    index('devices_ip_address_idx').on(table.ipAddress),
    index('devices_is_known_idx').on(table.isKnown),
  ],
);

/**
 * Hourly per-device bandwidth rollups.
 *
 * PRIVACY: Byte counts only — never traffic content. Granular flow data is
 * dropped after 24 hours; these rollups are retained for 7 days to feed the
 * consumption dashboards.
 */
export const usage = pgTable(
  'usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    /** Start of the hourly aggregation bucket. */
    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    uploadBytes: integer('upload_bytes').notNull().default(0),
    downloadBytes: integer('download_bytes').notNull().default(0),
    totalBytes: integer('total_bytes').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('usage_device_bucket_key').on(table.deviceId, table.bucketStart),
    index('usage_bucket_start_idx').on(table.bucketStart),
  ],
);

/**
 * Network health samples: latency, throughput and uptime.
 *
 * A null `device_id` denotes a network-wide measurement rather than a
 * per-device one.
 */
export const health = pgTable(
  'health',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'cascade' }),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
    latencyMs: numeric('latency_ms', { precision: 10, scale: 3 }).notNull(),
    downloadMbps: numeric('download_mbps', { precision: 10, scale: 3 }).notNull(),
    uploadMbps: numeric('upload_mbps', { precision: 10, scale: 3 }).notNull(),
    uptimeSeconds: integer('uptime_seconds').notNull().default(0),
  },
  (table) => [
    index('health_device_id_idx').on(table.deviceId),
    index('health_measured_at_idx').on(table.measuredAt),
  ],
);

/**
 * Alerts raised by the background trigger engine.
 */
export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').$type<'unknown_device' | 'high_usage'>().notNull(),
    severity: text('severity').$type<'info' | 'warning' | 'critical'>().notNull(),
    message: text('message').notNull(),
    deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
    thresholdBytes: integer('threshold_bytes'),
    observedBytes: integer('observed_bytes'),
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  },
  (table) => [
    index('alerts_triggered_at_idx').on(table.triggeredAt),
    index('alerts_acknowledged_at_idx').on(table.acknowledgedAt),
  ],
);

/**
 * Configurable rules that drive alert generation.
 */
export const alertRules = pgTable(
  'alert_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').$type<'unknown_device' | 'high_usage'>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    thresholdBytes: integer('threshold_bytes'),
    severity: text('severity').$type<'info' | 'warning' | 'critical'>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('alert_rules_type_key').on(table.type)],
);

export type DeviceRow = typeof devices.$inferSelect;
export type NewDeviceRow = typeof devices.$inferInsert;
export type UsageRow = typeof usage.$inferSelect;
export type NewUsageRow = typeof usage.$inferInsert;
export type HealthRow = typeof health.$inferSelect;
export type NewHealthRow = typeof health.$inferInsert;
export type AlertRow = typeof alerts.$inferSelect;
export type AlertRuleRow = typeof alertRules.$inferSelect;
