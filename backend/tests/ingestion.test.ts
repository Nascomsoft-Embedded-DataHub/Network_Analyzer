import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { createDatabase, type Database } from '../src/db/client.js';
import { devices as devicesTable } from '../src/db/schema.js';
import type { DiscoveredClient, DiscoverySource } from '../src/discovery/types.js';
import { IngestionListener } from '../src/ingestion/listener.js';
import { mergeDiscoveredClients } from '../src/ingestion/merge.js';
import { persistDiscoveredDevices, type UpsertOutcome } from '../src/ingestion/upsert.js';

/**
 * The ingestion pipeline against a real database.
 *
 * The claim these tests defend — one record per device, however many times
 * the pipeline runs — is a claim about the database as much as about the
 * code, so it is checked against one rather than a stub.
 *
 * The suite skips itself when no test database is configured, so the rest of
 * the tests still run on a machine without PostgreSQL.
 */
const connectionString = process.env.TEST_DATABASE_URL;

const describeWithDatabase = connectionString ? describe : describe.skip;

describeWithDatabase('ingestion pipeline', () => {
  let db: Database;

  beforeAll(async () => {
    db = createDatabase(connectionString!);
  });

  beforeEach(async () => {
    await db.delete(devicesTable);
  });

  const observedAt = new Date('2026-10-28T12:00:00.000Z');

  function neighbour(overrides: Partial<DiscoveredClient> = {}): DiscoveredClient {
    return {
      sourceName: 'neighbour-cache',
      sourceId: 'AA:BB:CC:11:22:33',
      macAddress: 'AA:BB:CC:11:22:33',
      ipAddress: '192.168.1.21',
      reportedName: null,
      macIsMasked: false,
      routerClientId: null,
      hasDhcpLease: null,
      interfaceType: null,
      observedAt,
      ...overrides,
    };
  }

  function router(overrides: Partial<DiscoveredClient> = {}): DiscoveredClient {
    return {
      sourceName: 'starlink-router',
      sourceId: 'cid:21',
      macAddress: 'AA:BB:CC:00:00:00',
      ipAddress: '192.168.1.21',
      reportedName: null,
      macIsMasked: true,
      routerClientId: 21,
      hasDhcpLease: true,
      interfaceType: null,
      observedAt,
      ...overrides,
    };
  }

  function addressOnly(overrides: Partial<DiscoveredClient> = {}): DiscoveredClient {
    return {
      sourceName: 'neighbour-cache',
      sourceId: 'ip:192.168.1.60',
      macAddress: null,
      ipAddress: '192.168.1.60',
      reportedName: null,
      macIsMasked: false,
      routerClientId: null,
      hasDhcpLease: null,
      interfaceType: null,
      observedAt,
      ...overrides,
    };
  }

  function anonymous(overrides: Partial<DiscoveredClient> = {}): DiscoveredClient {
    return {
      sourceName: 'neighbour-cache',
      sourceId: 'unidentified',
      macAddress: null,
      ipAddress: null,
      reportedName: null,
      macIsMasked: false,
      routerClientId: null,
      hasDhcpLease: null,
      interfaceType: null,
      observedAt,
      ...overrides,
    };
  }

  const vendorLookup = (mac: string | null): string | null =>
    mac ? 'Acme Devices Inc.' : null;

  async function write(observations: DiscoveredClient[]): Promise<UpsertOutcome> {
    return persistDiscoveredDevices(db, mergeDiscoveredClients(observations), {
      vendorLookup,
      observedAt,
    });
  }

  async function all(): Promise<(typeof devicesTable.$inferSelect)[]> {
    return db.select().from(devicesTable);
  }

  it('records a device the first time it is seen', async () => {
    await write([neighbour()]);
    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      identityKey: 'mac:AA:BB:CC:11:22:33',
      ipAddress: '192.168.1.21',
      macAddress: 'AA:BB:CC:11:22:33',
      vendor: 'Acme Devices Inc.',
      status: 'online',
      isKnown: false,
    });
  });

  it('does not record the same device twice when the pipeline runs again', async () => {
    await write([neighbour()]);
    await write([neighbour()]);
    await write([neighbour()]);
    expect(await all()).toHaveLength(1);
  });

  it('keeps two devices of one vendor apart even though they share an address', async () => {
    await write([
      router({ sourceId: 'cid:21', routerClientId: 21, ipAddress: '192.168.1.41' }),
      router({ sourceId: 'cid:22', routerClientId: 22, ipAddress: '192.168.1.42' }),
    ]);
    const rows = await all();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.identityKey).sort()).toEqual(['cid:21', 'cid:22']);
  });

  it('re-anchors a device to its hardware address without creating a second record', async () => {
    await write([router()]);
    expect((await all())[0]?.identityKey).toBe('cid:21');

    await write([router(), neighbour()]);
    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identityKey).toBe('mac:AA:BB:CC:11:22:33');
    expect(rows[0]?.macAddress).toBe('AA:BB:CC:11:22:33');
  });

  it('never overwrites the administrator decision to know a device', async () => {
    await write([neighbour()]);
    const [row] = await all();
    await db
      .update(devicesTable)
      .set({ isKnown: true })
      .where(eq(devicesTable.id, row!.id));

    await write([neighbour()]);
    const rows = await all();
    expect(rows[0]?.isKnown).toBe(true);
  });

  it('never moves the moment a device was first seen', async () => {
    await write([neighbour()]);
    const [row] = await all();
    await db
      .update(devicesTable)
      .set({ firstSeenAt: new Date('2026-01-01T00:00:00.000Z') })
      .where(eq(devicesTable.id, row!.id));

    await write([neighbour()]);
    expect((await all())[0]?.firstSeenAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('keeps the name the device asked for when the router stops reporting one', async () => {
    await write([router({ reportedName: 'living-room-tv' })]);
    await write([router({ reportedName: null })]);
    expect((await all())[0]?.hostname).toBe('living-room-tv');
  });

  it('keeps a device that is known only by its address', async () => {
    const outcome = await write([addressOnly()]);
    expect(outcome.inserted).toBe(1);

    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      identityKey: 'ip:192.168.1.60',
      ipAddress: '192.168.1.60',
      macAddress: null,
    });
  });

  it('re-anchors an address-only device when its hardware address is learned', async () => {
    await write([addressOnly()]);
    await write([
      neighbour({ sourceId: 'AA:BB:CC:99:88:77', macAddress: 'AA:BB:CC:99:88:77', ipAddress: '192.168.1.60' }),
    ]);

    const rows = await all();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.identityKey).toBe('mac:AA:BB:CC:99:88:77');
    expect(rows[0]?.macAddress).toBe('AA:BB:CC:99:88:77');
  });

  it('does not record an observation that carries no identifier at all', async () => {
    const outcome = await write([anonymous()]);
    expect(outcome.inserted).toBe(0);
    expect(outcome.skipped).toBe(1);
    expect(await all()).toHaveLength(0);
  });

  it('marks a device offline once it has gone quiet, and online when it returns', async () => {
    let clock = new Date('2026-10-28T12:00:00.000Z');
    const source: DiscoverySource = {
      name: 'neighbour-cache',
      description: 'test',
      discover: async () => (clock.getTime() < Date.parse('2026-10-28T12:05:00.000Z') ? [neighbour()] : []),
    };

    const listener = new IngestionListener({
      db,
      sources: [source],
      pollIntervalMs: 1000,
      offlineAfterMs: 60_000,
      vendorLookup,
      now: () => clock,
    });

    await listener.poll();
    expect((await all())[0]?.status).toBe('online');

    clock = new Date('2026-10-28T12:10:00.000Z');
    const outcome = await listener.poll();
    expect(outcome.markedOffline).toBe(1);
    expect((await all())[0]?.status).toBe('offline');
  });

  it('keeps polling when one source fails', async () => {
    const failing: DiscoverySource = {
      name: 'starlink-router',
      description: 'test',
      discover: async () => {
        throw new Error('router is unreachable');
      },
    };
    const working: DiscoverySource = {
      name: 'neighbour-cache',
      description: 'test',
      discover: async () => [neighbour()],
    };

    const listener = new IngestionListener({
      db,
      sources: [failing, working],
      pollIntervalMs: 1000,
      offlineAfterMs: 60_000,
      vendorLookup,
      now: () => observedAt,
    });

    const outcome = await listener.poll();
    expect(outcome.failures).toEqual([{ source: 'starlink-router', error: 'router is unreachable' }]);
    expect(await all()).toHaveLength(1);
  });
});
