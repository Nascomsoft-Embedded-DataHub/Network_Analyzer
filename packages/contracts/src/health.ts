import { z } from 'zod';
import { IdSchema, TimestampSchema } from './common.js';

/**
 * Network health metrics captured for a device or the whole network.
 *
 * PRIVACY: Latency, throughput and uptime only. Speed-test results describe
 * the link, never the traffic carried over it.
 */
export const HealthMetricSchema = z.object({
  id: IdSchema,
  /** Null for network-wide measurements. */
  deviceId: IdSchema.nullable(),
  timestamp: TimestampSchema,
  /** Round-trip latency in milliseconds. */
  latencyMs: z.number().nonnegative(),
  /** Measured download throughput in Mbps. */
  downloadMbps: z.number().nonnegative(),
  /** Measured upload throughput in Mbps. */
  uploadMbps: z.number().nonnegative(),
  /** Connection uptime in seconds over the reporting window. */
  uptimeSeconds: z.number().int().nonnegative(),
});

export const HealthListResponseSchema = z.object({
  data: z.array(HealthMetricSchema),
  meta: z.object({
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  }),
});

/** Most recent health snapshot, used for the dashboard status widgets. */
export const HealthSnapshotSchema = z.object({
  timestamp: TimestampSchema,
  latencyMs: z.number().nonnegative(),
  downloadMbps: z.number().nonnegative(),
  uploadMbps: z.number().nonnegative(),
  uptimeSeconds: z.number().int().nonnegative(),
  /** Overall reachability rollup across all known devices. */
  status: z.enum(['healthy', 'degraded', 'down']),
});

export const HealthSnapshotResponseSchema = z.object({
  data: HealthSnapshotSchema,
});

/** Query parameters accepted by `GET /api/health`. */
export const HealthListQuerySchema = z.object({
  deviceId: IdSchema.optional(),
  from: TimestampSchema.optional(),
  to: TimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(500),
  offset: z.coerce.number().int().min(0).default(0),
});

export type HealthMetric = z.infer<typeof HealthMetricSchema>;
export type HealthSnapshot = z.infer<typeof HealthSnapshotSchema>;
export type HealthListResponse = z.infer<typeof HealthListResponseSchema>;
export type HealthSnapshotResponse = z.infer<typeof HealthSnapshotResponseSchema>;
export type HealthListQuery = z.infer<typeof HealthListQuerySchema>;
