import { macOui } from '../discovery/address.js';
import type { DiscoveredClient, DiscoverySourceName } from '../discovery/types.js';
import {
  clientIdIdentityKey,
  identityBasis,
  ipIdentityKey,
  macIdentityKey,
  MAC_BASIS,
  UNIDENTIFIABLE_KEY,
} from './identity.js';

/**
 * Turning the observations of one poll into one record per device.
 *
 * Sources overlap and disagree. The router knows every attached client but
 * masks the hardware addresses; the operating system's neighbour cache knows
 * the real addresses but only for devices this machine has spoken to. The
 * merge is where the two are put back together, so that the inventory holds
 * one record per device rather than one per observation.
 */

/** A device as the merge understands it, before it is written to the database. */
export interface MergedDevice {
  /** The key the record is anchored to. */
  identityKey: string;
  /** The best hardware address known, trusted or not. */
  macAddress: string | null;
  /** The address the device holds now. */
  ipAddress: string | null;
  /** The name the source reported, when one was reported. */
  reportedName: string | null;
  /** The router's client id, when the device was seen through a router. */
  routerClientId: number | null;
  /** True when the hardware address is masked to its vendor OUI. */
  macIsMasked: boolean;
  /** Which sources saw the device. */
  sources: string[];
}

/**
 * Which source an address came from, and how much to trust it.
 *
 * A router's address is live but may be masked. The neighbour cache's
 * address is real but may be stale. When both know the device, the router's
 * address wins, because the router is reporting the present while the cache
 * is reporting the past.
 */
/**
 * How much to trust an address a source reports.
 *
 * A router's address is live but may be masked. The neighbour cache's
 * address is real but may be stale. When both know a device, the router's
 * address wins, because the router is reporting the present while the cache
 * is reporting the past.
 *
 * Typed as an exhaustive record so that adding a source means deciding how
 * far its addresses can be trusted, rather than silently trusting it at
 * level zero.
 */
const ADDRESS_TRUST: Record<DiscoverySourceName, number> = {
  'starlink-router': 2,
  'neighbour-cache': 1,
  simulated: 2,
};

/** Sources whose hardware addresses are the device's real ones. */
const TRUSTED_MAC_SOURCES = new Set<DiscoverySourceName>(['neighbour-cache', 'simulated']);

interface DeviceGroup {
  /** The device's real hardware address, when a trusted source reported one. */
  trustedMac: string | null;
  /** Any reported address, masked or not. */
  reportedMac: string | null;
  macIsMasked: boolean;
  ipAddress: string | null;
  ipTrust: number;
  reportedName: string | null;
  routerClientId: number | null;
  sources: Set<string>;
}

function trustFor(source: DiscoverySourceName): number {
  return ADDRESS_TRUST[source];
}

/**
 * The link between two observations of the same device.
 *
 * Three rules, in the order they are tried:
 *
 * 1. **The same real hardware address.** Two trusted sources naming the same
 *    device. Always the same device.
 * 2. **The same network address.** The router and the neighbour cache both
 *    saw the device at one address in the same poll. The same device, unless
 *    one of them reports a real address that contradicts the other.
 * 3. **The same vendor, unambiguously.** The router masks the address down
 *    to the vendor OUI, so a masked address still says who made the device.
 *    When one masked address and one real address share a vendor and there is
 *    no other candidate, they are the same device — which is what keeps a
 *    device that has just taken a new address from being counted twice.
 */
export function mergeDiscoveredClients(clients: DiscoveredClient[]): MergedDevice[] {
  const groups: DeviceGroup[] = [];

  const newGroup = (client: DiscoveredClient): DeviceGroup => ({
    trustedMac:
      client.macAddress && !client.macIsMasked && TRUSTED_MAC_SOURCES.has(client.sourceName)
        ? client.macAddress
        : null,
    reportedMac: client.macAddress,
    macIsMasked: client.macIsMasked,
    ipAddress: client.ipAddress,
    ipTrust: trustFor(client.sourceName),
    reportedName: client.reportedName,
    routerClientId: client.routerClientId,
    sources: new Set([client.sourceName]),
  });

  // How many masked addresses share each vendor OUI. A vendor with more than
  // one masked address cannot be resolved to a single device.
  const maskedCounts = new Map<string, number>();
  for (const client of clients) {
    if (client.macAddress && client.macIsMasked) {
      const oui = macOui(client.macAddress);
      if (oui) maskedCounts.set(oui, (maskedCounts.get(oui) ?? 0) + 1);
    }
  }

  const absorb = (group: DeviceGroup, client: DiscoveredClient): void => {
    if (client.macAddress && !client.macIsMasked && TRUSTED_MAC_SOURCES.has(client.sourceName)) {
      group.trustedMac = client.macAddress;
      group.reportedMac = client.macAddress;
      group.macIsMasked = false;
    } else if (client.macAddress && !group.reportedMac) {
      group.reportedMac = client.macAddress;
      group.macIsMasked = client.macIsMasked;
    }
    const trust = trustFor(client.sourceName);
    if (client.ipAddress && trust >= group.ipTrust) {
      group.ipAddress = client.ipAddress;
      group.ipTrust = trust;
    }
    if (client.reportedName && !group.reportedName) {
      group.reportedName = client.reportedName;
    }
    if (client.routerClientId !== null && group.routerClientId === null) {
      group.routerClientId = client.routerClientId;
    }
    group.sources.add(client.sourceName);
  };

  // Real hardware addresses first: they establish the device, and everything
  // without one is matched against them.
  for (const client of clients) {
    const trusted =
      client.macAddress && !client.macIsMasked && TRUSTED_MAC_SOURCES.has(client.sourceName)
        ? client.macAddress
        : null;
    if (!trusted) continue;
    const existing = groups.find((group) => group.trustedMac === trusted);
    if (existing) {
      absorb(existing, client);
      continue;
    }
    groups.push(newGroup(client));
  }

  // Everything else: router clients, and anything with no address at all.
  for (const client of clients) {
    const trusted =
      client.macAddress && !client.macIsMasked && TRUSTED_MAC_SOURCES.has(client.sourceName)
        ? client.macAddress
        : null;
    if (trusted) continue;

    if (client.ipAddress) {
      const byIp = groups.find(
        (group) => group.ipAddress === client.ipAddress && group.trustedMac !== trusted,
      );
      if (byIp) {
        absorb(byIp, client);
        continue;
      }
    }

    const oui = macOui(client.macAddress);
    if (oui && (maskedCounts.get(oui) ?? 0) === 1) {
      const candidates = groups.filter(
        (group) =>
          group.trustedMac !== null &&
          macOui(group.trustedMac) === oui &&
          group.routerClientId === null,
      );
      if (candidates.length === 1) {
        absorb(candidates[0]!, client);
        continue;
      }
    }

    groups.push(newGroup(client));
  }

  return groups.map(toMergedDevice);
}

function toMergedDevice(group: DeviceGroup): MergedDevice {
  let identityKey: string;
  if (group.trustedMac) {
    identityKey = macIdentityKey(group.trustedMac);
  } else if (group.routerClientId !== null) {
    identityKey = clientIdIdentityKey(group.routerClientId);
  } else if (group.ipAddress) {
    identityKey = ipIdentityKey(group.ipAddress);
  } else {
    // A device with no address and no id cannot be tracked at all.
    identityKey = UNIDENTIFIABLE_KEY;
  }

  return {
    identityKey,
    macAddress: group.trustedMac ?? group.reportedMac,
    ipAddress: group.ipAddress,
    reportedName: group.reportedName,
    routerClientId: group.routerClientId,
    macIsMasked: group.macIsMasked && group.trustedMac === null,
    sources: [...group.sources],
  };
}

/** True when the key is anchored to a hardware address. */
export function isMacKeyed(identityKey: string): boolean {
  return identityBasis(identityKey) === MAC_BASIS;
}
