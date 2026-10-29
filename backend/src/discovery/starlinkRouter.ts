import { normalizeMac } from './address.js';
import {
  decodeClientRosterResponse,
  encodeClientRosterRequest,
} from './starlinkProtocol.js';
import {
  createGrpcTransport,
  createGrpcWebTransport,
  type StarlinkCall,
  type StarlinkTransportKind,
} from './starlinkTransport.js';
import type { DiscoveredClient, DiscoverySource } from './types.js';

/**
 * Discovery from a Starlink router's own client roster.
 *
 * The router exposes its connected devices over a local gRPC control plane,
 * and the roster it returns is the closest thing to a DHCP lease table the
 * administrator can read: every associated client, with its address, its
 * name, and the state of its lease.
 *
 * Two properties of that roster shape everything downstream:
 *
 * - **MACs are masked.** The firmware reports the vendor OUI and blanks the
 *   low three octets, so every device from one vendor shares one address.
 *   The MAC therefore identifies a vendor, not a device, and the roster's own
 *   `client_id` is the identifier used instead.
 * - **There is no history.** The router answers with the roster as it stands
 *   right now; it keeps nothing. The poll interval is the sampling
 *   resolution, and a client that is not attached is simply absent.
 */

/** How the router reports the interface a client is attached through. */
function describeInterface(raw: string): string | null {
  switch (raw) {
    case 'ETH':
      return 'ethernet';
    case 'RF_2GHZ':
      return '2.4ghz';
    case 'RF_5GHZ':
    case 'RF_5GHZ_HIGH':
      return '5ghz';
    default:
      return null;
  }
}

/**
 * True when the low three octets have been blanked.
 *
 * The firmware blanks them to zero, so an address ending in three zero
 * octets carries no device identity.
 */
function hasBlankedLowOctets(mac: string): boolean {
  const octets = mac.split(':');
  return octets.slice(3).every((octet) => octet === '00');
}

export interface StarlinkRouterOptions {
  host?: string;
  port?: number;
  transport?: StarlinkTransportKind;
  timeoutMs?: number;
  /** Overrides the transport. Used by the tests to stand in for a router. */
  call?: StarlinkCall;
}

export class StarlinkRouterSource implements DiscoverySource {
  readonly name = 'starlink-router' as const;
  readonly description = 'Starlink router client roster (local gRPC)';

  private readonly call: StarlinkCall;
  private readonly close: () => void;

  constructor(options: StarlinkRouterOptions = {}) {
    const host = options.host ?? '192.168.1.1';
    const port = options.port ?? 9000;
    const timeoutMs = options.timeoutMs ?? 5_000;

    if (options.call) {
      this.call = options.call;
      this.close = () => undefined;
      return;
    }

    const transport =
      options.transport === 'grpc-web'
        ? createGrpcWebTransport(host, port, timeoutMs)
        : createGrpcTransport(host, port, timeoutMs);
    this.call = transport.call;
    this.close = transport.close;
  }

  async discover(): Promise<DiscoveredClient[]> {
    const responseBytes = await this.call(encodeClientRosterRequest());
    const roster = decodeClientRosterResponse(responseBytes);

    if (roster.statusCode !== 0) {
      throw new Error(
        `router refused the client-roster request (status ${roster.statusCode}${
          roster.statusMessage ? `: ${roster.statusMessage}` : ''
        })`,
      );
    }

    const observedAt = new Date();
    // A MAC that two clients share cannot be identifying either of them, which
    // is how masking shows up in the roster even when the blanked octets do
    // not look blank.
    const macCounts = new Map<string, number>();
    for (const client of roster.clients) {
      const mac = normalizeMac(client.macAddress);
      if (mac) macCounts.set(mac, (macCounts.get(mac) ?? 0) + 1);
    }

    const clients: DiscoveredClient[] = [];
    for (const client of roster.clients) {
      const macAddress = normalizeMac(client.macAddress);
      const ipAddress = client.ipAddress.trim() || null;

      // A client with neither an address nor an identifier cannot be tracked.
      if (!macAddress && !ipAddress) continue;

      const macIsMasked = macAddress
        ? (macCounts.get(macAddress) ?? 0) > 1 || hasBlankedLowOctets(macAddress)
        : false;

      clients.push({
        sourceName: 'starlink-router',
        sourceId: client.clientId > 0 ? `cid:${client.clientId}` : (macAddress ?? ipAddress!),
        macAddress,
        ipAddress,
        reportedName: client.name.trim() || null,
        macIsMasked,
        routerClientId: client.clientId > 0 ? client.clientId : null,
        hasDhcpLease: client.dhcpLeaseFound ? client.dhcpLeaseActive : null,
        interfaceType: describeInterface(client.interfaceType),
        observedAt,
      });
    }

    return clients;
  }

  /** Releases the transport. The listener calls this on shutdown. */
  dispose(): void {
    this.close();
  }
}
