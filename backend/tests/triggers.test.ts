import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AlertTriggerEngine } from '../src/alerts/triggers.js';
import { createDatabase, type Database } from '../src/db/client.js';
import { alertRules, alerts, devices, usage } from '../src/db/schema.js';

/**
 * The alert trigger engine.
 *
 * The engine writes to the database and reads rules from it, so these tests
 * run against a real PostgreSQL instance: the claim being defended is a claim
 * about what ends up in the `alerts` table, and a stubbed database cannot
 * defend it.
 *
 * The suite skips itself when no database is configured, so the rest of the
 * tests still run on a machine without PostgreSQL.
 */
const connectionString = process.env.TEST_DATABASE_URL;

const describeWithDatabase = connectionString ? describe : describe.skip;

const NOW = new Date('2026-11-05T12:00:00.000Z');

describeWithDatabase('alert trigger engine', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
  });

  beforeEach(async () => {
    await db.delete(alerts);
    await db.delete(usage);
    await db.delete(alertRules);
    await db.delete(devices);
  });

  afterAll(async () => {
    // The suite empties the rules table so that each test starts from a
    // known state. The defaults the migration seeded are put back afterwards,
    // so a local database is left the way the migration left it.
    await db
      .insert(alertRules)
      .values([
        { type: 'unknown_device', enabled: true, thresholdBytes: null, severity: 'warning' },
        {
          type: 'high_usage',
          enabled: true,
          thresholdBytes: 5368709120,
          severity: 'critical',
        },
      ])
      .onConflictDoNothing();
  });

  async function makeDevice(
    overrides: Partial<typeof devices.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await db
      .insert(devices)
      .values({
        identityKey: `mac:AA:BB:CC:DD:EE:FF`,
        ipAddress: '192.168.1.21',
        macAddress: 'AA:BB:CC:DD:EE:FF',
        hostname: 'kitchen-tablet',
        ...overrides,
      })
      .returning({ id: devices.id });
    return row!.id;
  }

  async function setRule(
    type: 'unknown_device' | 'high_usage',
    overrides: Partial<typeof alertRules.$inferInsert> = {},
  ): Promise<void> {
    await db.insert(alertRules).values({
      type,
      enabled: true,
      severity: type === 'unknown_device' ? 'warning' : 'critical',
      ...overrides,
    });
  }

  async function recordUsage(
    deviceId: string,
    bucketStart: string,
    bytes: number,
  ): Promise<void> {
    await db.insert(usage).values({
      deviceId,
      bucketStart: new Date(bucketStart),
      uploadBytes: Math.round(bytes / 4),
      downloadBytes: Math.round((bytes * 3) / 4),
      totalBytes: bytes,
    });
  }

  function engine(now: Date = NOW): AlertTriggerEngine {
    return new AlertTriggerEngine({ db, now: () => now });
  }

  describe('unknown devices', () => {
    it('raises an alert for a device nobody has confirmed', async () => {
      await setRule('unknown_device');
      const deviceId = await makeDevice();

      const evaluation = await engine().evaluate();

      expect(evaluation.unknownDeviceAlerts).toBe(1);

      const [alert] = await db.select().from(alerts);
      expect(alert!.type).toBe('unknown_device');
      expect(alert!.severity).toBe('warning');
      expect(alert!.deviceId).toBe(deviceId);
      expect(alert!.message).toContain('kitchen-tablet');
      expect(alert!.thresholdBytes).toBeNull();
      expect(alert!.observedBytes).toBeNull();
    });

    it('raises one alert per device', async () => {
      await setRule('unknown_device');
      await makeDevice({ identityKey: 'mac:AA:BB:CC:DD:EE:01' });
      await makeDevice({ identityKey: 'mac:AA:BB:CC:DD:EE:02' });

      const evaluation = await engine().evaluate();

      expect(evaluation.unknownDeviceAlerts).toBe(2);
      expect(await db.select().from(alerts)).toHaveLength(2);
    });

    it('does not raise the same alert again on the next pass', async () => {
      await setRule('unknown_device');
      await makeDevice();

      const triggers = engine();
      await triggers.evaluate();
      const second = await triggers.evaluate();

      expect(second.unknownDeviceAlerts).toBe(0);
      expect(await db.select().from(alerts)).toHaveLength(1);
    });

    it('says nothing about a device that is already known', async () => {
      await setRule('unknown_device');
      await makeDevice({ isKnown: true });

      const evaluation = await engine().evaluate();

      expect(evaluation.unknownDeviceAlerts).toBe(0);
      expect(await db.select().from(alerts)).toHaveLength(0);
    });

    it('says nothing when the rule is disabled', async () => {
      await setRule('unknown_device', { enabled: false });
      await makeDevice();

      const evaluation = await engine().evaluate();

      expect(evaluation.rulesEvaluated).toBe(0);
      expect(evaluation.unknownDeviceAlerts).toBe(0);
      expect(await db.select().from(alerts)).toHaveLength(0);
    });
  });

  describe('high usage', () => {
    it('raises an alert when a device passes its daily allowance', async () => {
      await setRule('high_usage', { thresholdBytes: 1000 });
      const deviceId = await makeDevice();
      await recordUsage(deviceId, '2026-11-05T10:00:00.000Z', 1500);

      const evaluation = await engine().evaluate();

      expect(evaluation.highUsageAlerts).toBe(1);

      const [alert] = await db.select().from(alerts);
      expect(alert!.type).toBe('high_usage');
      expect(alert!.severity).toBe('critical');
      expect(alert!.deviceId).toBe(deviceId);
      expect(alert!.thresholdBytes).toBe(1000);
      expect(alert!.observedBytes).toBe(1500);
      expect(alert!.message).toContain('kitchen-tablet');
    });

    it('sums the whole day before comparing it with the threshold', async () => {
      await setRule('high_usage', { thresholdBytes: 1000 });
      const deviceId = await makeDevice();
      await recordUsage(deviceId, '2026-11-05T01:00:00.000Z', 400);
      await recordUsage(deviceId, '2026-11-05T02:00:00.000Z', 700);

      const evaluation = await engine().evaluate();

      expect(evaluation.highUsageAlerts).toBe(1);
      const [alert] = await db.select().from(alerts);
      expect(alert!.observedBytes).toBe(1100);
    });

    it('does not raise a second alert on the same day', async () => {
      await setRule('high_usage', { thresholdBytes: 1000 });
      const deviceId = await makeDevice();
      await recordUsage(deviceId, '2026-11-05T10:00:00.000Z', 1500);

      const triggers = engine();
      await triggers.evaluate();
      const second = await triggers.evaluate();

      expect(second.highUsageAlerts).toBe(0);
      expect(await db.select().from(alerts)).toHaveLength(1);
    });

    it('raises an alert again on the next day', async () => {
      await setRule('high_usage', { thresholdBytes: 1000 });
      const deviceId = await makeDevice();
      await recordUsage(deviceId, '2026-11-05T10:00:00.000Z', 1500);

      await engine().evaluate();

      await recordUsage(deviceId, '2026-11-06T10:00:00.000Z', 1500);
      const nextDay = await engine(new Date('2026-11-06T12:00:00.000Z')).evaluate();

      expect(nextDay.highUsageAlerts).toBe(1);
      expect(await db.select().from(alerts)).toHaveLength(2);
    });

    it('ignores the traffic of previous days', async () => {
      await setRule('high_usage', { thresholdBytes: 1000 });
      const deviceId = await makeDevice();
      await recordUsage(deviceId, '2026-11-04T10:00:00.000Z', 9000);

      const evaluation = await engine().evaluate();

      expect(evaluation.highUsageAlerts).toBe(0);
      expect(await db.select().from(alerts)).toHaveLength(0);
    });

    it('stays silent for a rule with no threshold', async () => {
      await setRule('high_usage', { thresholdBytes: null });
      const deviceId = await makeDevice();
      await recordUsage(deviceId, '2026-11-05T10:00:00.000Z', 9000);

      const evaluation = await engine().evaluate();

      expect(evaluation.highUsageAlerts).toBe(0);
      expect(await db.select().from(alerts)).toHaveLength(0);
    });

    it('leaves a device below its allowance alone', async () => {
      await setRule('high_usage', { thresholdBytes: 1000 });
      const deviceId = await makeDevice();
      await recordUsage(deviceId, '2026-11-05T10:00:00.000Z', 999);

      const evaluation = await engine().evaluate();

      expect(evaluation.highUsageAlerts).toBe(0);
    });
  });

  it('evaluates both rules in one pass', async () => {
    await setRule('unknown_device');
    await setRule('high_usage', { thresholdBytes: 1000 });
    const deviceId = await makeDevice();
    await recordUsage(deviceId, '2026-11-05T10:00:00.000Z', 1500);

    const evaluation = await engine().evaluate();

    expect(evaluation.rulesEvaluated).toBe(2);
    expect(evaluation.unknownDeviceAlerts).toBe(1);
    expect(evaluation.highUsageAlerts).toBe(1);
    expect(await db.select().from(alerts)).toHaveLength(2);
  });
});
