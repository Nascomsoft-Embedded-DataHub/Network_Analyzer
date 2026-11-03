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
  /**
   * Seconds of continuous reachability.
   *
   * The analyser's own streak of successful probes, reset whenever a probe
   * fails — not the router's own uptime counter, which measures something
   * else entirely.
   */
  uptimeSeconds: z.number().int().nonnegative(),
});

/**
 * The status bands a health reading falls into.
 *
 * Pinned here, in the shared package, because the backend's snapshot endpoint
 * and the dashboard both need to agree: a reading the API calls `degraded`
 * must not appear as `healthy` on screen. Both sides import
 * {@link healthStatus} rather than repeating the thresholds.
 *
 * - `healthy` — the link is quick and carries real throughput.
 * - `degraded` — the link still carries traffic, but slowly or late.
 * - `down` — the link cannot carry usable traffic.
 */
export const HEALTH_BANDS = {
  healthy: { maxLatencyMs: 50, minDownloadMbps: 10 },
  degraded: { maxLatencyMs: 200, minDownloadMbps: 1 },
} as const;

export type HealthStatus = z.infer<typeof HealthSnapshotSchema>['status'];

/**
 * Classify a health reading into a status band.
 *
 * The healthy band is the one the API contract documents: latency at most
 * 50 ms with at least 10 Mbps downstream. The degraded band is the same test
 * relaxed to 200 ms and 1 Mbps. Anything below that is `down`.
 *
 * Throughput is what decides: a link with excellent latency but no capacity
 * is not healthy, and a link with capacity but poor latency is not healthy
 * either.
 */
export function healthStatus(latencyMs: number, downloadMbps: number): HealthStatus {
  if (
    latencyMs <= HEALTH_BANDS.healthy.maxLatencyMs &&
    downloadMbps >= HEALTH_BANDS.healthy.minDownloadMbps
  ) {
    return 'healthy';
  }
  if (
    latencyMs <= HEALTH_BANDS.degraded.maxLatencyMs &&
    downloadMbps >= HEALTH_BANDS.degraded.minDownloadMbps
  ) {
    return 'degraded';
  }
  return 'down';
}

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
