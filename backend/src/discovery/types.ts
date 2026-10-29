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
}
