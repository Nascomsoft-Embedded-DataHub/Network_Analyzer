import { describe, expect, it } from 'vitest';

import type { DiscoveredClient } from '../src/discovery/types.js';
import { mergeDiscoveredClients } from '../src/ingestion/merge.js';

function observation(overrides: Partial<DiscoveredClient> = {}): DiscoveredClient {
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
    observedAt: new Date('2026-10-28T12:00:00.000Z'),
    ...overrides,
  };
}

const routerObservation = (overrides: Partial<DiscoveredClient> = {}): DiscoveredClient =>
  observation({
    sourceName: 'starlink-router',
    sourceId: 'cid:21',
    macAddress: 'AA:BB:CC:00:00:00',
    ipAddress: '192.168.1.21',
    macIsMasked: true,
    routerClientId: 21,
    hasDhcpLease: true,
    ...overrides,
  });

describe('mergeDiscoveredClients', () => {
  it('anchors a device to its hardware address when one is known', () => {
    const merged = mergeDiscoveredClients([observation()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.identityKey).toBe('mac:AA:BB:CC:11:22:33');
  });

  it('anchors a router-only device to the router client id, not the masked address', () => {
    const merged = mergeDiscoveredClients([routerObservation()]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.identityKey).toBe('cid:21');
    expect(merged[0]?.macIsMasked).toBe(true);
  });

  it('keeps two devices of one vendor apart even though they share an address', () => {
    const merged = mergeDiscoveredClients([
      routerObservation({ sourceId: 'cid:21', ipAddress: '192.168.1.41', routerClientId: 21 }),
      routerObservation({ sourceId: 'cid:22', ipAddress: '192.168.1.42', routerClientId: 22 }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((device) => device.identityKey)).toEqual(['cid:21', 'cid:22']);
  });

  it('joins the router view and the neighbour cache view of one device', () => {
    const merged = mergeDiscoveredClients([
      observation(),
      routerObservation({ reportedName: 'ike-iphone' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.identityKey).toBe('mac:AA:BB:CC:11:22:33');
    expect(merged[0]?.reportedName).toBe('ike-iphone');
    expect(merged[0]?.sources).toEqual(['neighbour-cache', 'starlink-router']);
  });

  it('joins the two views of a device that has just taken a new address', () => {
    // The neighbour cache still holds the old address; the router knows the
    // new one. The vendor prefix is the only thing that ties them together.
    const merged = mergeDiscoveredClients([
      observation({ ipAddress: '192.168.1.21' }),
      routerObservation({ ipAddress: '192.168.1.77' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.identityKey).toBe('mac:AA:BB:CC:11:22:33');
    // The router is reporting the present, so its address is the one to keep.
    expect(merged[0]?.ipAddress).toBe('192.168.1.77');
  });

  it('does not join two devices of one vendor when the prefix cannot tell them apart', () => {
    const merged = mergeDiscoveredClients([
      observation({ macAddress: '7C:A6:B6:11:22:33', ipAddress: '192.168.1.41' }),
      observation({ macAddress: '7C:A6:B6:44:55:66', ipAddress: '192.168.1.42' }),
      routerObservation({
        sourceId: 'cid:21',
        macAddress: '7C:A6:B6:00:00:00',
        ipAddress: '192.168.1.41',
        routerClientId: 21,
      }),
      routerObservation({
        sourceId: 'cid:22',
        macAddress: '7C:A6:B6:00:00:00',
        ipAddress: '192.168.1.42',
        routerClientId: 22,
      }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((device) => device.identityKey).sort()).toEqual([
      'mac:7C:A6:B6:11:22:33',
      'mac:7C:A6:B6:44:55:66',
    ]);
  });

  it('keeps the router address when it is the only one known', () => {
    const merged = mergeDiscoveredClients([
      observation(),
      routerObservation({ ipAddress: '192.168.1.77' }),
    ]);
    expect(merged[0]?.ipAddress).toBe('192.168.1.77');
  });

  it('keeps the live address whichever source was observed first', () => {
    // The simulator stands in for the router: it reports the address the
    // device holds now, while the neighbour cache may still hold the address
    // it had before it renewed its lease. The order the sources happen to be
    // polled in must not change the answer.
    const merged = mergeDiscoveredClients([
      observation({ sourceName: 'simulated', sourceId: 'simulated-1', ipAddress: '192.168.1.77' }),
      observation({ ipAddress: '192.168.1.21' }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.ipAddress).toBe('192.168.1.77');
  });

  it('anchors a simulated client to its hardware address', () => {
    const merged = mergeDiscoveredClients([
      observation({
        sourceName: 'simulated',
        sourceId: 'AA:BB:CC:44:55:66',
        macAddress: 'AA:BB:CC:44:55:66',
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.identityKey).toBe('mac:AA:BB:CC:44:55:66');
  });

  it('anchors a device with nothing but an address to that address', () => {
    const merged = mergeDiscoveredClients([
      observation({ macAddress: null, routerClientId: null }),
    ]);
    expect(merged[0]?.identityKey).toBe('ip:192.168.1.21');
  });
});
