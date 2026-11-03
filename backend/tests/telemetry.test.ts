import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { createDatabase, type Database } from '../src/db/client.js';
import { devices as devicesTable, health as healthTable, usage as usageTable } from '../src/db/schema.js';
import type { DiscoverySource, HealthReading } from '../src/discovery/types.js';
import { IngestionListener } from '../src/ingestion/listener.js';
import { BandwidthCollector, TrafficAccumulator } from '../src/telemetry/collector.js';
import { HealthSampler, UptimeStreak } from '../src/telemetry/health.js';
import { RetentionSweeper } from '../src/telemetry/retention.js';

/**
 * The telemetry jobs.
 *
 * The arithmetic — which hour a byte belongs to — is checked on its own,
 * because that is where the mistakes hide. The jobs that write to the
 * database are checked against a real one, because the claim they defend is
 * a claim about the database as much as about the code.
 *
 * The suite that needs a database skips itself when none is configured, so
 * the rest of the tests still run on a machine without PostgreSQL.
 */
const connectionString = process.env.TEST_DATABASE_URL;

const describeWithDatabase = connectionString ? describe : describe.skip;

const at = (time: string): Date => new Date(`2026-10-28T${time}:00.000Z`);

describe('traffic accumulator', () => {
  it('counts nothing for the first reading of a device', () => {
    const accumulator = new TrafficAccumulator();
    accumulator.register('device-1', null);
    accumulator.observe('device-1', { rxBytes: 1000, txBytes: 500 }, at('12:30'));

    const items = accumulator.drain();
    expect(items).toHaveLength(1);
    // No traffic, but the baseline still has to be recorded: it is what
    // makes the next reading a difference rather than a first reading.
    expect(items[0]!.buckets).toHaveLength(0);
    expect(items[0]!.latest).toEqual({ rxBytes: 1000, txBytes: 500 });
  });

  it('counts the difference between two readings into the hour of the first', () => {
    const accumulator = new TrafficAccumulator();
    accumulator.register('device-1', null);
    accumulator.observe('device-1', { rxBytes: 1000, txBytes: 500 }, at('12:30'));
    accumulator.observe('device-1', { rxBytes: 3000, txBytes: 900 }, at('12:45'));

    const items = accumulator.drain();
    expect(items[0]!.buckets).toHaveLength(1);
    expect(items[0]!.buckets[0]!.bucketStart.toISOString()).toBe('2026-10-28T12:00:00.000Z');
    // The router's received counter is the client's download.
    expect(items[0]!.buckets[0]!.delta).toEqual({ downloadBytes: 2000, uploadBytes: 400 });
  });

  it('counts a reattached device from zero in the hour it was seen', () => {
    const accumulator = new TrafficAccumulator();
    accumulator.register('device-1', null);
    accumulator.observe('device-1', { rxBytes: 5000, txBytes: 3000 }, at('12:30'));
    accumulator.observe('device-1', { rxBytes: 100, txBytes: 50 }, at('13:05'));

    const items = accumulator.drain();
    expect(items[0]!.buckets).toHaveLength(1);
    expect(items[0]!.buckets[0]!.bucketStart.toISOString()).toBe('2026-10-28T13:00:00.000Z');
    expect(items[0]!.buckets[0]!.delta).toEqual({ downloadBytes: 100, uploadBytes: 50 });
  });

  it('spreads the traffic of an outage across the hours it could have happened in', () => {
    const accumulator = new TrafficAccumulator();
    accumulator.register('device-1', {
      counters: { rxBytes: 0, txBytes: 0 },
      at: at('12:00'),
    });
    accumulator.observe('device-1', { rxBytes: 3000, txBytes: 600 }, at('15:20'));

    const items = accumulator.drain();
    // Four hours, so the traffic is divided between them rather than
    // landing on one of them as a spike.
    expect(items[0]!.buckets).toHaveLength(4);
    expect(items[0]!.buckets.map((bucket) => bucket.bucketStart.toISOString())).toEqual([
      '2026-10-28T12:00:00.000Z',
      '2026-10-28T13:00:00.000Z',
      '2026-10-28T14:00:00.000Z',
      '2026-10-28T15:00:00.000Z',
    ]);
    expect(items[0]!.buckets.map((bucket) => bucket.delta.downloadBytes)).toEqual([
      750, 750, 750, 750,
    ]);
    expect(items[0]!.buckets.map((bucket) => bucket.delta.uploadBytes)).toEqual([150, 150, 150, 150]);
  });

  it('keeps the total exact when the traffic does not divide evenly', () => {
    const accumulator = new TrafficAccumulator();
    accumulator.register('device-1', {
      counters: { rxBytes: 0, txBytes: 0 },
      at: at('12:00'),
    });
    accumulator.observe('device-1', { rxBytes: 3001, txBytes: 0 }, at('15:20'));

    const items = accumulator.drain();
    const total = items[0]!.buckets.reduce((sum, bucket) => sum + bucket.delta.downloadBytes, 0);
    expect(total).toBe(3001);
  });

  it('keeps the pending traffic when a write fails', () => {
    const accumulator = new TrafficAccumulator();
    accumulator.register('device-1', null);
    accumulator.observe('device-1', { rxBytes: 1000, txBytes: 500 }, at('12:30'));
    accumulator.observe('device-1', { rxBytes: 3000, txBytes: 900 }, at('12:45'));

    const items = accumulator.drain();
    accumulator.restore(items);

    const again = accumulator.drain();
    expect(again[0]!.buckets[0]!.delta).toEqual({ downloadBytes: 2000, uploadBytes: 400 });
  });
});

describe('uptime streak', () => {
  it('counts the seconds since the streak began', () => {
    const streak = new UptimeStreak();
    expect(streak.succeed(at('12:00'))).toBe(0);
    expect(streak.succeed(new Date('2026-10-28T12:00:30.000Z'))).toBe(30);
    expect(streak.succeed(at('12:01'))).toBe(60);
  });

  it('starts again after a failure', () => {
    const streak = new UptimeStreak();
    streak.succeed(at('12:00'));
    streak.fail();
    expect(streak.succeed(at('12:30'))).toBe(0);
    expect(streak.succeed(at('12:31'))).toBe(60);
  });
});

describeWithDatabase('bandwidth collector', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
  });

  beforeEach(async () => {
    await db.delete(usageTable);
    await db.delete(healthTable);
    await db.delete(devicesTable);
  });

  async function makeDevice(identityKey = 'mac:AA:BB:CC:DD:EE:FF'): Promise<string> {
    const [row] = await db
      .insert(devicesTable)
      .values({
        identityKey,
        ipAddress: '192.168.1.21',
        macAddress: 'AA:BB:CC:DD:EE:FF',
      })
      .returning({ id: devicesTable.id });
    return row!.id;
  }

  it('writes the traffic of a device into an hourly bucket', async () => {
    const deviceId = await makeDevice();
    const collector = new BandwidthCollector({ db });

    await collector.record([
      { deviceId, rxBytes: 1000, txBytes: 500, observedAt: at('12:30') },
    ]);
    await collector.record([
      { deviceId, rxBytes: 3000, txBytes: 900, observedAt: at('12:45') },
    ]);

    const report = await collector.flush();
    expect(report.buckets).toBe(1);

    const rows = await db.select().from(usageTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      deviceId,
      downloadBytes: 2000,
      uploadBytes: 400,
      totalBytes: 2400,
    });
    expect(rows[0]!.bucketStart.toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });

  it('advances the baseline on the device row', async () => {
    const deviceId = await makeDevice();
    const collector = new BandwidthCollector({ db });

    await collector.record([
      { deviceId, rxBytes: 1000, txBytes: 500, observedAt: at('12:30') },
    ]);
    await collector.flush();

    const [row] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    expect(row!.lastRxBytes).toBe(1000);
    expect(row!.lastTxBytes).toBe(500);
    expect(row!.lastCountersAt?.toISOString()).toBe('2026-10-28T12:30:00.000Z');
  });

  it('counts the difference and not the whole counter after a restart', async () => {
    const deviceId = await makeDevice();

    const first = new BandwidthCollector({ db });
    await first.record([
      { deviceId, rxBytes: 1000, txBytes: 500, observedAt: at('12:30') },
    ]);
    await first.flush();

    // A restart: a collector with nothing in memory, which has to take the
    // baseline from the database.
    const restarted = new BandwidthCollector({ db });
    await restarted.record([
      { deviceId, rxBytes: 4000, txBytes: 700, observedAt: at('12:45') },
    ]);
    await restarted.flush();

    const rows = await db.select().from(usageTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.downloadBytes).toBe(3000);
    expect(rows[0]!.uploadBytes).toBe(200);
  });

  it('adds to a bucket that already holds traffic', async () => {
    const deviceId = await makeDevice();

    const first = new BandwidthCollector({ db });
    await first.record([
      { deviceId, rxBytes: 1000, txBytes: 500, observedAt: at('12:30') },
    ]);
    await first.record([
      { deviceId, rxBytes: 3000, txBytes: 900, observedAt: at('12:45') },
    ]);
    await first.flush();

    const second = new BandwidthCollector({ db });
    await second.record([
      { deviceId, rxBytes: 5000, txBytes: 1300, observedAt: at('12:50') },
    ]);
    await second.flush();

    const rows = await db.select().from(usageTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.downloadBytes).toBe(4000);
    expect(rows[0]!.uploadBytes).toBe(800);
  });

  it('writes nothing for a device that has not moved', async () => {
    const deviceId = await makeDevice();
    const collector = new BandwidthCollector({ db });

    await collector.record([
      { deviceId, rxBytes: 1000, txBytes: 500, observedAt: at('12:30') },
    ]);
    await collector.record([
      { deviceId, rxBytes: 1000, txBytes: 500, observedAt: at('12:45') },
    ]);
    await collector.flush();

    expect(await db.select().from(usageTable)).toHaveLength(0);
  });

  it('counts the traffic of a poll from end to end', async () => {
    const collector = new BandwidthCollector({ db });
    let counters = { rxBytes: 1000, txBytes: 500 };

    const source: DiscoverySource = {
      name: 'starlink-router',
      description: 'test',
      discover: async () => [
        {
          sourceName: 'starlink-router',
          sourceId: 'cid:21',
          macAddress: null,
          ipAddress: '192.168.1.41',
          reportedName: 'hall-lamp',
          macIsMasked: false,
          routerClientId: 21,
          hasDhcpLease: true,
          interfaceType: null,
          rxBytes: counters.rxBytes,
          txBytes: counters.txBytes,
          associatedTimeSeconds: 120,
          observedAt: at('12:30'),
        },
      ],
    };

    const listener = new IngestionListener({
      db,
      sources: [source],
      pollIntervalMs: 1000,
      offlineAfterMs: 60_000,
      trafficSink: collector,
      now: () => at('12:30'),
    });

    await listener.poll();
    counters = { rxBytes: 3000, txBytes: 900 };
    await listener.poll();
    await collector.flush();

    const rows = await db.select().from(usageTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.downloadBytes).toBe(2000);
    expect(rows[0]!.uploadBytes).toBe(400);
    expect(rows[0]!.bucketStart.toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });
});

describeWithDatabase('health sampler', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
  });

  beforeEach(async () => {
    await db.delete(healthTable);
  });

  function source(reading: HealthReading | Error): DiscoverySource {
    return {
      name: 'starlink-router',
      description: 'test',
      discover: async () => [],
      probeHealth: async () => {
        if (reading instanceof Error) throw reading;
        return reading;
      },
    };
  }

  const complete: HealthReading = { latencyMs: 24, downloadMbps: 412, uploadMbps: 96 };

  it('records a complete reading', async () => {
    const sampler = new HealthSampler({ db, sources: [source(complete)] });
    const sample = await sampler.sample();

    expect(sample.stored).toBe(true);
    const rows = await db.select().from(healthTable);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.latencyMs)).toBe(24);
    expect(Number(rows[0]!.downloadMbps)).toBe(412);
    expect(Number(rows[0]!.uploadMbps)).toBe(96);
  });

  it('does not record a reading that is missing a figure', async () => {
    const sampler = new HealthSampler({
      db,
      sources: [source({ latencyMs: 24, downloadMbps: null, uploadMbps: 96 })],
    });
    const sample = await sampler.sample();

    expect(sample.stored).toBe(false);
    expect(await db.select().from(healthTable)).toHaveLength(0);
  });

  it('reports the uptime of the unbroken run of probes', async () => {
    let clock = at('12:00');
    const sampler = new HealthSampler({
      db,
      sources: [source(complete)],
      now: () => clock,
    });

    await sampler.sample();
    clock = new Date(clock.getTime() + 60_000);
    const second = await sampler.sample();

    expect(second.uptimeSeconds).toBe(60);
    const rows = await db.select().from(healthTable);
    expect(rows[0]!.uptimeSeconds).toBe(0);
    expect(rows[1]!.uptimeSeconds).toBe(60);
  });

  it('breaks the uptime streak when the probe fails', async () => {
    let clock = at('12:00');
    let failing = false;
    const flaky: DiscoverySource = {
      name: 'starlink-router',
      description: 'test',
      discover: async () => [],
      probeHealth: async () => {
        if (failing) throw new Error('router did not answer');
        return complete;
      },
    };

    const sampler = new HealthSampler({ db, sources: [flaky], now: () => clock });
    await sampler.sample();

    clock = new Date(clock.getTime() + 60_000);
    failing = true;
    await sampler.sample();

    clock = new Date(clock.getTime() + 60_000);
    failing = false;
    const after = await sampler.sample();

    // The streak restarted, so the uptime is measured from the probe that
    // succeeded after the failure.
    expect(after.uptimeSeconds).toBe(0);
  });
});

describeWithDatabase('retention sweeper', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
  });

  beforeEach(async () => {
    await db.delete(usageTable);
    await db.delete(healthTable);
    await db.delete(devicesTable);
  });

  it('removes the rows that have aged out', async () => {
    const [row] = await db
      .insert(devicesTable)
      .values({ identityKey: 'mac:AA:BB:CC:DD:EE:FF', ipAddress: '192.168.1.21' })
      .returning({ id: devicesTable.id });

    const old = new Date('2026-10-20T12:00:00.000Z');
    const recent = new Date('2026-10-28T12:00:00.000Z');

    await db.insert(usageTable).values([
      { deviceId: row!.id, bucketStart: old, uploadBytes: 1, downloadBytes: 2, totalBytes: 3 },
      { deviceId: row!.id, bucketStart: recent, uploadBytes: 4, downloadBytes: 5, totalBytes: 9 },
    ]);
    await db.insert(healthTable).values([
      { deviceId: null, measuredAt: old, latencyMs: '24', downloadMbps: '400', uploadMbps: '90' },
      { deviceId: null, measuredAt: recent, latencyMs: '24', downloadMbps: '400', uploadMbps: '90' },
    ]);

    const sweeper = new RetentionSweeper({
      db,
      usageRetentionDays: 7,
      healthRetentionDays: 7,
      now: () => at('12:00'),
    });
    const report = await sweeper.sweep();

    expect(report.usageRows).toBe(1);
    expect(report.healthRows).toBe(1);

    const usage = await db.select().from(usageTable);
    expect(usage).toHaveLength(1);
    expect(usage[0]!.bucketStart.toISOString()).toBe(recent.toISOString());

    const health = await db.select().from(healthTable);
    expect(health).toHaveLength(1);
    expect(health[0]!.measuredAt.toISOString()).toBe(recent.toISOString());
  });
});
