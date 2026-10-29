import {
  HealthSnapshotResponseSchema,
  MOCK_ALERT_RULES,
  MOCK_ALERTS,
  MOCK_DEVICES,
  MOCK_HEALTH,
  MOCK_USAGE,
  SessionResponseSchema,
  SystemInfoResponseSchema,
  UsageSummaryResponseSchema,
  UsageTimelineResponseSchema,
  type Alert,
  type AlertRule,
  type Device,
  type HealthMetric,
  type UsageRecord,
  type UsageTimelinePoint,
} from '@network-analyser/contracts';

/**
 * Mock payloads.
 *
 * Most fixtures come straight from `@network-analyser/contracts`. The contract
 * package has no fixture for `GET /api/system/info`, `GET /api/health/snapshot`
 * or `GET /api/auth/session`, so those are built here from the same schema —
 * every payload below is parsed by its contract schema, so a fixture that
 * drifts from the contract fails here rather than on screen.
 */

/**
 * Stands in for the analyser instance.
 *
 * `loopbackOnly` is false on purpose: the phone can only reach the analyser
 * when it is bound to the LAN interface, and the exposure warning must be
 * visible while developing rather than only in the pilot.
 */
export const MOCK_SYSTEM_INFO = SystemInfoResponseSchema.parse({
  data: {
    version: '0.1.0-mock',
    startedAt: '2026-10-27T14:45:00.000Z',
    uptimeSeconds: 1802,
    bindHost: '0.0.0.0',
    bindPort: 3000,
    hostname: 'MOCK-LAPTOP',
    runtime: {
      nodeVersion: 'v24.19.0',
      platform: 'linux x64',
    },
    loopbackOnly: false,
  },
});

/** Stands in for an authenticated session. The backend has no auth route yet. */
export const MOCK_SESSION = SessionResponseSchema.parse({
  data: {
    user: {
      id: 'a1000000-0000-4000-8000-000000000001',
      name: 'Mock Administrator',
      email: 'admin@example.test',
      role: 'admin',
    },
    expiresAt: '2026-10-28T00:00:00.000Z',
  },
});

/**
 * Health status bands.
 *
 * The contract pins only the `healthy` band (latency <= 50 ms and at least
 * 10 Mbps down). The `degraded` and `down` thresholds below are a frontend
 * approximation until Stanley documents the remaining bands.
 */
export function healthStatus(latencyMs: number, downloadMbps: number): 'healthy' | 'degraded' | 'down' {
  if (latencyMs <= 50 && downloadMbps >= 10) return 'healthy';
  if (latencyMs <= 200 && downloadMbps >= 1) return 'degraded';
  return 'down';
}

const latestHealth = MOCK_HEALTH.reduce((newest, metric) =>
  Date.parse(metric.timestamp) > Date.parse(newest.timestamp) ? metric : newest,
);

export const MOCK_HEALTH_SNAPSHOT = HealthSnapshotResponseSchema.parse({
  data: {
    timestamp: latestHealth.timestamp,
    latencyMs: latestHealth.latencyMs,
    downloadMbps: latestHealth.downloadMbps,
    uploadMbps: latestHealth.uploadMbps,
    uptimeSeconds: latestHealth.uptimeSeconds,
    status: healthStatus(latestHealth.latencyMs, latestHealth.downloadMbps),
  },
});

/** Network-wide totals per hour, derived from the per-device usage records. */
function buildTimelinePoints(records: UsageRecord[]): UsageTimelinePoint[] {
  const byBucket = new Map<string, UsageTimelinePoint>();
  for (const record of records) {
    const existing = byBucket.get(record.bucketStart);
    if (existing) {
      existing.totalBytes += record.totalBytes;
      existing.uploadBytes += record.uploadBytes;
      existing.downloadBytes += record.downloadBytes;
      continue;
    }
    byBucket.set(record.bucketStart, {
      bucketStart: record.bucketStart,
      totalBytes: record.totalBytes,
      uploadBytes: record.uploadBytes,
      downloadBytes: record.downloadBytes,
    });
  }
  return [...byBucket.values()].sort((a, b) => a.bucketStart.localeCompare(b.bucketStart));
}

const hourlyPoints = buildTimelinePoints(MOCK_USAGE);

export const MOCK_USAGE_TIMELINE = UsageTimelineResponseSchema.parse({
  data: hourlyPoints,
  meta: {
    granularity: 'hour',
    from: hourlyPoints[0]?.bucketStart ?? '2026-10-27T07:00:00.000Z',
    to: hourlyPoints[hourlyPoints.length - 1]?.bucketStart ?? '2026-10-27T08:00:00.000Z',
  },
});

/** Totals for one device over the window covered by the usage fixtures. */
export function mockUsageSummary(deviceId: string) {
  const records = MOCK_USAGE.filter((record) => record.deviceId === deviceId);
  const uploadBytes = records.reduce((sum, record) => sum + record.uploadBytes, 0);
  const downloadBytes = records.reduce((sum, record) => sum + record.downloadBytes, 0);

  return UsageSummaryResponseSchema.parse({
    data: {
      deviceId,
      from: records[0]?.bucketStart ?? '2026-10-27T07:00:00.000Z',
      to: records[records.length - 1]?.bucketStart ?? '2026-10-27T08:00:00.000Z',
      uploadBytes,
      downloadBytes,
      totalBytes: uploadBytes + downloadBytes,
    },
  });
}

/** Fixture accessors — the mock handlers apply filtering and pagination. */
export const mockFixtures = {
  devices: () => MOCK_DEVICES.map((device) => ({ ...device })),
  usage: () => MOCK_USAGE.map((record) => ({ ...record })),
  health: () => MOCK_HEALTH.map((metric) => ({ ...metric })),
  alerts: () => MOCK_ALERTS.map((alert) => ({ ...alert })),
  alertRules: () => MOCK_ALERT_RULES.map((rule) => ({ ...rule })),
} satisfies {
  devices: () => Device[];
  usage: () => UsageRecord[];
  health: () => HealthMetric[];
  alerts: () => Alert[];
  alertRules: () => AlertRule[];
};
