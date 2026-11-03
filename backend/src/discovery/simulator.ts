import type { DiscoveredClient, DiscoverySource, HealthReading } from './types.js';

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
    rxBytes: null,
    txBytes: null,
    associatedTimeSeconds: null,
    observedAt: new Date(),
    ...overrides,
  };
}

/**
 * The traffic each simulated client moves, in bytes per second.
 *
 * The mix is deliberate: one heavy downloader, one streaming device and a
 * couple of near-idle ones, so a demo shows a ranked list of consumers
 * rather than a flat line. It also gives the bandwidth collector something
 * to measure: the counters below are cumulative and grow with time, exactly
 * as the router's own counters do.
 */
const SIMULATED_TRAFFIC: Record<string, { rxPerSecond: number; txPerSecond: number }> = {
  'AA:BB:CC:11:22:33': { rxPerSecond: 1_200_000, txPerSecond: 200_000 },
  'AA:BB:CC:44:55:66': { rxPerSecond: 3_100_000, txPerSecond: 640_000 },
  'AA:BB:CC:77:88:99': { rxPerSecond: 2_400_000, txPerSecond: 40_000 },
  '58:04:4F:AA:0B:9D': { rxPerSecond: 60_000, txPerSecond: 60_000 },
  'cid:21': { rxPerSecond: 12_000, txPerSecond: 2_000 },
  'cid:22': { rxPerSecond: 9_000, txPerSecond: 2_000 },
  '00:1B:44:11:3A:B7': { rxPerSecond: 320_000, txPerSecond: 48_000 },
};

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
  /** Cumulative counters, as the router would report them. */
  private readonly counters = new Map<
    string,
    { rxBytes: number; txBytes: number; associatedTimeSeconds: number }
  >();
  /** When the roster was last read, so the counters can advance by elapsed time. */
  private lastReadAt: Date | null = null;

  constructor(roster: DiscoveredClient[] = SIMULATED_CLIENTS) {
    this.roster = roster;
  }

  async discover(): Promise<DiscoveredClient[]> {
    const observedAt = new Date();
    const elapsedSeconds = this.lastReadAt
      ? Math.max(0, (observedAt.getTime() - this.lastReadAt.getTime()) / 1000)
      : 0;
    this.lastReadAt = observedAt;

    return this.roster.map((entry) => {
      const traffic = SIMULATED_TRAFFIC[entry.sourceId] ?? { rxPerSecond: 0, txPerSecond: 0 };
      const counters = this.counters.get(entry.sourceId) ?? {
        rxBytes: 0,
        txBytes: 0,
        associatedTimeSeconds: 0,
      };
      counters.rxBytes += Math.round(traffic.rxPerSecond * elapsedSeconds);
      counters.txBytes += Math.round(traffic.txPerSecond * elapsedSeconds);
      counters.associatedTimeSeconds += Math.round(elapsedSeconds);
      this.counters.set(entry.sourceId, counters);

      return {
        ...entry,
        rxBytes: counters.rxBytes,
        txBytes: counters.txBytes,
        associatedTimeSeconds: counters.associatedTimeSeconds,
        observedAt,
      };
    });
  }

  /** Replaces the roster, which is how a test simulates a device leaving. */
  setRoster(roster: DiscoveredClient[]): void {
    this.roster = roster;
  }

  /**
   * A synthetic health reading, so a demo has something to show.
   *
   * The figures drift gently around the values a Starlink link typically
   * sustains, rather than sitting still, so that a chart built from them
   * looks like a measurement instead of a placeholder.
   */
  async probeHealth(): Promise<HealthReading> {
    const wobble = Math.sin(Date.now() / 30_000);
    const round = (value: number): number => Math.round(value * 100) / 100;
    return {
      latencyMs: round(24 + wobble * 3),
      downloadMbps: round(412 + wobble * 20),
      uploadMbps: round(96 + wobble * 8),
    };
  }
}
