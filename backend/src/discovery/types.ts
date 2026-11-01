/**
 * Shared vocabulary for the discovery layer.
 *
 * A discovery source answers one question: "which clients are attached right
 * now, and what do you know about each of them?" Sources differ wildly in what
 * they can tell you, so the shape below is deliberately the *union* of what
 * every source might know, with `null` for what a given source does not.
 */

/** Identifier of a discovery source, matching `DISCOVERY_SOURCES`. */
export type DiscoverySourceName = 'neighbour-cache' | 'starlink-router' | 'simulated';

/**
 * One client observed by a source.
 *
 * PRIVACY: network-layer addressing only. No account identity, no browsing
 * history, no association of the device with a natural person.
 */
export interface DiscoveredClient {
  /** Which source produced this observation. */
  sourceName: DiscoverySourceName;
  /**
   * The identifier this source itself uses for the client.
   *
   * For a router that is its own client id; for the neighbour cache it is the
   * MAC address.
   */
  sourceId: string;
  /** Hardware address, normalised. `null` when the source does not report one. */
  macAddress: string | null;
  /** IPv4 address. `null` when the source does not report one. */
  ipAddress: string | null;
  /**
   * Cumulative bytes received by the client, as the source counts them.
   *
   * `null` when the source does not report traffic counters. The count is
   * cumulative rather than per-interval, so consumption is the difference
   * between two readings — never the reading itself.
   */
  rxBytes: number | null;
  /**
   * Cumulative bytes sent by the client.
   *
   * `null` when the source does not report traffic counters.
   */
  txBytes: number | null;
  /**
   * How long the client has been attached, in seconds.
   *
   * `null` when the source does not report it.
   */
  associatedTimeSeconds: number | null;
  /** Name the source reports, typically the DHCP hostname. */
  reportedName: string | null;
  /**
   * True when the MAC has been truncated to its vendor OUI.
   *
   * Such an address identifies a vendor, not a device, and must never be used
   * as an identity. The vendor can still be read from it — the OUI is the part
   * that survives.
   */
  macIsMasked: boolean;
  /** The router's own per-client id, when the source exposes one. */
  routerClientId: number | null;
  /**
   * True when the source can see the client holding a DHCP lease.
   *
   * `null` when the source cannot tell — the neighbour cache has no view of
   * the lease table.
   */
  hasDhcpLease: boolean | null;
  /** How the client is attached, e.g. `ethernet`, `2.4ghz`, `5ghz`. */
  interfaceType: string | null;
  /** When the source saw the client. */
  observedAt: Date;
}

/** A place the analyser can learn about connected devices. */
export interface DiscoverySource {
  /** Identifier used in configuration and logs. */
  readonly name: DiscoverySourceName;
  /** One-line description for the boot log. */
  readonly description: string;
  /**
   * List the clients currently attached.
   *
   * Implementations throw on failure; the listener decides what a failing
   * source means for the poll as a whole.
   */
  discover(): Promise<DiscoveredClient[]>;
  /**
   * Measure the health of the network, when this source can.
   *
   * Optional, because only some sources can see the wider network: the
   * neighbour cache knows only what this machine has spoken to, while the
   * router can measure the link itself.
   *
   * A reading that could not be taken is reported as a null field rather than
   * as a zero, so that "no measurement" is never mistaken for "a measurement
   * of nothing".
   */
  probeHealth?(): Promise<HealthReading>;
}

/**
 * A measurement of the network's health.
 *
 * The throughput figures are the link's *capacity* — what it can carry, not
 * what it is carrying right now. The two are not interchangeable: a network
 * that is carrying nothing is perfectly healthy, and a dashboard that
 * reported it as having no bandwidth would be wrong.
 */
export interface HealthReading {
  /** Round-trip latency in milliseconds, or null when it could not be measured. */
  latencyMs: number | null;
  /** Capacity downstream, in megabits per second. */
  downloadMbps: number | null;
  /** Capacity upstream, in megabits per second. */
  uploadMbps: number | null;
}
