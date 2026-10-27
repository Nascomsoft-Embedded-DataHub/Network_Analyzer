import { describe, expect, it } from 'vitest';
import {
  AlertListResponseSchema,
  AlertRuleListResponseSchema,
  DeviceListResponseSchema,
  HealthListResponseSchema,
  Ipv4AddressSchema,
  MacAddressSchema,
  UsageListResponseSchema,
  UsageTimelineResponseSchema,
} from '../src/index.js';
import {
  MOCK_ALERTS,
  MOCK_ALERT_RULES,
  MOCK_DEVICES,
  MOCK_HEALTH,
  MOCK_USAGE,
} from '../src/mock.js';

describe('mock fixtures satisfy their schemas', () => {
  it('devices match the device list contract', () => {
    const parsed = DeviceListResponseSchema.parse({
      data: MOCK_DEVICES,
      meta: { total: MOCK_DEVICES.length, limit: 50, offset: 0 },
    });
    expect(parsed.data).toHaveLength(MOCK_DEVICES.length);
  });

  it('usage records match the usage list contract', () => {
    const parsed = UsageListResponseSchema.parse({
      data: MOCK_USAGE,
      meta: { total: MOCK_USAGE.length, limit: 500, offset: 0 },
    });
    expect(parsed.data).toHaveLength(MOCK_USAGE.length);
  });

  it('usage totals equal upload plus download', () => {
    for (const record of MOCK_USAGE) {
      expect(record.totalBytes).toBe(record.uploadBytes + record.downloadBytes);
    }
  });

  it('health metrics match the health list contract', () => {
    const parsed = HealthListResponseSchema.parse({
      data: MOCK_HEALTH,
      meta: { total: MOCK_HEALTH.length, limit: 500, offset: 0 },
    });
    expect(parsed.data).toHaveLength(MOCK_HEALTH.length);
  });

  it('alerts match the alert list contract', () => {
    const parsed = AlertListResponseSchema.parse({
      data: MOCK_ALERTS,
      meta: { total: MOCK_ALERTS.length, limit: 50, offset: 0 },
    });
    expect(parsed.data).toHaveLength(MOCK_ALERTS.length);
  });

  it('alert rules match the rule list contract', () => {
    const parsed = AlertRuleListResponseSchema.parse({ data: MOCK_ALERT_RULES });
    expect(parsed.data).toHaveLength(MOCK_ALERT_RULES.length);
  });
});

describe('usage timeline contract', () => {
  it('accepts a timeline response with granularity metadata', () => {
    const parsed = UsageTimelineResponseSchema.parse({
      data: [
        {
          bucketStart: '2026-10-27T08:00:00.000Z',
          totalBytes: 2_252_341_248,
          uploadBytes: 104_857_600,
          downloadBytes: 2_147_483_648,
        },
      ],
      meta: {
        granularity: 'hour',
        from: '2026-10-27T07:00:00.000Z',
        to: '2026-10-27T09:00:00.000Z',
      },
    });
    expect(parsed.meta.granularity).toBe('hour');
  });
});

describe('MAC address normalisation contract', () => {
  it('accepts the uppercase colon-delimited form used by the fixtures', () => {
    expect(MacAddressSchema.safeParse('AA:BB:CC:11:22:33').success).toBe(true);
  });

  it('rejects lowercase and hyphen-separated MAC addresses', () => {
    expect(MacAddressSchema.safeParse('aa:bb:cc:11:22:33').success).toBe(false);
    expect(MacAddressSchema.safeParse('AA-BB-CC-11-22-33').success).toBe(false);
  });

  it('rejects a malformed MAC address', () => {
    expect(MacAddressSchema.safeParse('AA:BB:CC:11:22').success).toBe(false);
    expect(MacAddressSchema.safeParse('not-a-mac').success).toBe(false);
  });
});

describe('IPv4 address contract', () => {
  it('accepts dotted-quad addresses', () => {
    expect(Ipv4AddressSchema.safeParse('192.168.1.42').success).toBe(true);
  });

  it('rejects out-of-range octets', () => {
    expect(Ipv4AddressSchema.safeParse('192.168.1.256').success).toBe(false);
    expect(Ipv4AddressSchema.safeParse('192.168.1').success).toBe(false);
  });
});
