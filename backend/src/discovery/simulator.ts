import type { DiscoveredClient, DiscoverySource } from './types.js';

/**
 * A synthetic device roster.
 *
 * Two jobs. It lets the ingestion pipeline be exercised end to end without a
 * router or a network to look at, which is what the test suite needs. And it
 * gives the dashboard something to show during a demo on a machine that is
 * not attached to the pilot network.
 *
 * The roster deliberately includes the awkward cases the real sources
 * produce: two bulbs from one vendor wearing a single masked address, a
 * device that holds a static address, and a client with no lease.
 */

function client(overrides: Partial<DiscoveredClient> & { sourceId: string }): DiscoveredClient {
  return {
    sourceName: 'simulated',
    macAddress: null,
    ipAddress: null,
    reportedName: null,
    macIsMasked: false,
    routerClientId: null,
    hasDhcpLease: null,
    interfaceType: null,
    observedAt: new Date(),
    ...overrides,
  };
}

export const SIMULATED_CLIENTS: DiscoveredClient[] = [
  client({
    sourceId: 'AA:BB:CC:11:22:33',
    macAddress: 'AA:BB:CC:11:22:33',
    ipAddress: '192.168.1.21',
    reportedName: 'ike-iphone',
    routerClientId: 11,
    hasDhcpLease: true,
    interfaceType: '5ghz',
  }),
  client({
    sourceId: 'AA:BB:CC:44:55:66',
    macAddress: 'AA:BB:CC:44:55:66',
    ipAddress: '192.168.1.24',
    reportedName: 'ike-work-laptop',
    routerClientId: 12,
    hasDhcpLease: true,
    interfaceType: '5ghz',
  }),
  client({
    sourceId: 'AA:BB:CC:77:88:99',
    macAddress: 'AA:BB:CC:77:88:99',
    ipAddress: '192.168.1.31',
    reportedName: 'living-room-tv',
    routerClientId: 13,
    hasDhcpLease: true,
    interfaceType: '5ghz',
  }),
  client({
    sourceId: '58:04:4F:AA:0B:9D',
    macAddress: '58:04:4F:AA:0B:9D',
    ipAddress: '192.168.1.1',
    reportedName: 'starlink-router',
    routerClientId: 1,
    hasDhcpLease: false,
    interfaceType: 'ethernet',
  }),
  // Two bulbs from one vendor. The router reports the same masked address
  // for both, which is exactly the case that makes a MAC-keyed inventory
  // fold them into one device.
  client({
    sourceId: 'cid:21',
    macAddress: '7C:A6:B6:00:00:00',
    ipAddress: '192.168.1.41',
    reportedName: 'bedroom-lamp',
    macIsMasked: true,
    routerClientId: 21,
    hasDhcpLease: true,
    interfaceType: '2.4ghz',
  }),
  client({
    sourceId: 'cid:22',
    macAddress: '7C:A6:B6:00:00:00',
    ipAddress: '192.168.1.42',
    reportedName: 'hall-lamp',
    macIsMasked: true,
    routerClientId: 22,
    hasDhcpLease: true,
    interfaceType: '2.4ghz',
  }),
  // A printer on a static address, with no lease behind it.
  client({
    sourceId: '00:1B:44:11:3A:B7',
    macAddress: '00:1B:44:11:3A:B7',
    ipAddress: '192.168.1.40',
    reportedName: 'office-printer',
    routerClientId: 31,
    hasDhcpLease: false,
    interfaceType: 'ethernet',
  }),
];

export class SimulatedSource implements DiscoverySource {
  readonly name = 'simulated' as const;
  readonly description = 'Simulated device roster';

  private roster: DiscoveredClient[];

  constructor(roster: DiscoveredClient[] = SIMULATED_CLIENTS) {
    this.roster = roster;
  }

  async discover(): Promise<DiscoveredClient[]> {
    const observedAt = new Date();
    return this.roster.map((entry) => ({ ...entry, observedAt }));
  }

  /** Replaces the roster, which is how a test simulates a device leaving. */
  setRoster(roster: DiscoveredClient[]): void {
    this.roster = roster;
  }
}
