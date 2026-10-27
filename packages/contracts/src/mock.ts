/**
 * Deterministic mock payloads for frontend development.
 *
 * The frontend track builds against these until the backend exposes real
 * endpoints. Every fixture validates against the matching schema, so a
 * contract change breaks these fixtures rather than silently drifting.
 *
 * Fixed UUIDs and timestamps keep snapshots stable across runs.
 */

import type { Alert, AlertRule } from './alert.js';
import type { Device } from './device.js';
import type { HealthMetric } from './health.js';
import type { UsageRecord } from './usage.js';

export const MOCK_DEVICE_IDS = {
  iphone: '11111111-1111-4111-8111-111111111111',
  laptop: '22222222-2222-4222-8222-222222222222',
  tv: '33333333-3333-4333-8333-333333333333',
  printer: '44444444-4444-4444-8444-444444444444',
  unknown: '55555555-5555-4555-8555-555555555555',
} as const;

export const MOCK_DEVICES: Device[] = [
  {
    id: MOCK_DEVICE_IDS.iphone,
    ipAddress: '192.168.1.21',
    macAddress: 'AA:BB:CC:11:22:33',
    hostname: 'ike-iphone',
    vendor: 'Apple, Inc.',
    isKnown: true,
    status: 'online',
    firstSeenAt: '2026-10-20T07:12:00.000Z',
    lastSeenAt: '2026-10-27T09:15:00.000Z',
  },
  {
    id: MOCK_DEVICE_IDS.laptop,
    ipAddress: '192.168.1.24',
    macAddress: 'AA:BB:CC:44:55:66',
    hostname: 'ike-work-laptop',
    vendor: 'Apple, Inc.',
    isKnown: true,
    status: 'online',
    firstSeenAt: '2026-10-20T07:14:00.000Z',
    lastSeenAt: '2026-10-27T09:14:30.000Z',
  },
  {
    id: MOCK_DEVICE_IDS.tv,
    ipAddress: '192.168.1.31',
    macAddress: 'AA:BB:CC:77:88:99',
    hostname: 'living-room-tv',
    vendor: 'Samsung Electronics Co.,Ltd',
    isKnown: true,
    status: 'online',
    firstSeenAt: '2026-10-21T18:02:00.000Z',
    lastSeenAt: '2026-10-27T09:13:00.000Z',
  },
  {
    id: MOCK_DEVICE_IDS.printer,
    ipAddress: '192.168.1.40',
    macAddress: 'AA:BB:CC:00:11:22',
    hostname: 'office-printer',
    vendor: 'HP Inc.',
    isKnown: true,
    status: 'offline',
    firstSeenAt: '2026-10-20T08:00:00.000Z',
    lastSeenAt: '2026-10-26T22:41:00.000Z',
  },
  {
    id: MOCK_DEVICE_IDS.unknown,
    ipAddress: '192.168.1.57',
    macAddress: 'AA:BB:CC:33:44:55',
    hostname: null,
    vendor: null,
    isKnown: false,
    status: 'unknown',
    firstSeenAt: '2026-10-27T06:33:00.000Z',
    lastSeenAt: '2026-10-27T09:12:00.000Z',
  },
];

/** Two hours of hourly buckets for the peak-usage timeline. */
export const MOCK_USAGE: UsageRecord[] = [
  {
    id: 'a0000000-0000-4000-8000-000000000001',
    deviceId: MOCK_DEVICE_IDS.laptop,
    bucketStart: '2026-10-27T07:00:00.000Z',
    uploadBytes: 52_428_800,
    downloadBytes: 1_073_741_824,
    totalBytes: 1_126_170_624,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000002',
    deviceId: MOCK_DEVICE_IDS.iphone,
    bucketStart: '2026-10-27T07:00:00.000Z',
    uploadBytes: 10_485_760,
    downloadBytes: 268_435_456,
    totalBytes: 278_921_216,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000003',
    deviceId: MOCK_DEVICE_IDS.tv,
    bucketStart: '2026-10-27T07:00:00.000Z',
    uploadBytes: 2_097_152,
    downloadBytes: 943_718_400,
    totalBytes: 945_815_552,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000004',
    deviceId: MOCK_DEVICE_IDS.laptop,
    bucketStart: '2026-10-27T08:00:00.000Z',
    uploadBytes: 104_857_600,
    downloadBytes: 2_147_483_648,
    totalBytes: 2_252_341_248,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000005',
    deviceId: MOCK_DEVICE_IDS.tv,
    bucketStart: '2026-10-27T08:00:00.000Z',
    uploadBytes: 1_048_576,
    downloadBytes: 1_610_612_736,
    totalBytes: 1_611_661_312,
  },
  {
    id: 'a0000000-0000-4000-8000-000000000006',
    deviceId: MOCK_DEVICE_IDS.iphone,
    bucketStart: '2026-10-27T08:00:00.000Z',
    uploadBytes: 15_728_640,
    downloadBytes: 402_653_184,
    totalBytes: 418_381_824,
  },
];

export const MOCK_HEALTH: HealthMetric[] = [
  {
    id: 'b0000000-0000-4000-8000-000000000001',
    deviceId: null,
    timestamp: '2026-10-27T09:15:00.000Z',
    latencyMs: 18.4,
    downloadMbps: 412.7,
    uploadMbps: 96.3,
    uptimeSeconds: 86_400,
  },
  {
    id: 'b0000000-0000-4000-8000-000000000002',
    deviceId: null,
    timestamp: '2026-10-27T09:00:00.000Z',
    latencyMs: 21.1,
    downloadMbps: 398.2,
    uploadMbps: 88.7,
    uptimeSeconds: 82_800,
  },
];

export const MOCK_ALERTS: Alert[] = [
  {
    id: 'c0000000-0000-4000-8000-000000000001',
    type: 'unknown_device',
    severity: 'warning',
    message: 'New device detected on the network',
    deviceId: MOCK_DEVICE_IDS.unknown,
    thresholdBytes: null,
    observedBytes: null,
    triggeredAt: '2026-10-27T06:33:00.000Z',
    acknowledgedAt: null,
  },
  {
    id: 'c0000000-0000-4000-8000-000000000002',
    type: 'high_usage',
    severity: 'critical',
    message: 'Device exceeded the daily consumption threshold',
    deviceId: MOCK_DEVICE_IDS.laptop,
    thresholdBytes: 5_368_709_120,
    observedBytes: 6_442_450_944,
    triggeredAt: '2026-10-27T08:45:00.000Z',
    acknowledgedAt: null,
  },
];

export const MOCK_ALERT_RULES: AlertRule[] = [
  {
    id: 'd0000000-0000-4000-8000-000000000001',
    type: 'unknown_device',
    enabled: true,
    thresholdBytes: null,
    severity: 'warning',
    updatedAt: '2026-10-27T07:00:00.000Z',
  },
  {
    id: 'd0000000-0000-4000-8000-000000000002',
    type: 'high_usage',
    enabled: true,
    thresholdBytes: 5_368_709_120,
    severity: 'critical',
    updatedAt: '2026-10-27T07:00:00.000Z',
  },
];
