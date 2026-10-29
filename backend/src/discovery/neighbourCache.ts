import { execFile } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { promisify } from 'node:util';

import { isUnroutableIpv4, normalizeMac } from './address.js';
import type { DiscoveredClient, DiscoverySource } from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Discovery from the host operating system's ARP/neighbour cache.
 *
 * This is the only source that reports *true* hardware addresses, because the
 * kernel learns them from the frames it actually receives. It is also the
 * least complete: the cache holds a device only once this machine has spoken
 * to it, so a device that has been idle since boot never appears.
 *
 * The router's own client roster (see `starlinkRouter`) covers that gap, at
 * the price of masked MACs. Running both and reconciling them is what gives a
 * complete inventory with correct hardware addresses.
 */

const MAC_TOKEN = /(?<![0-9A-Fa-f])([0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5})(?![0-9A-Fa-f])/;
const IPV4_TOKEN = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])/;

/** The address every device on the segment shares; it identifies nobody. */
const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';

/**
 * Parse the output of an ARP or neighbour table.
 *
 * Deliberately format-agnostic rather than line-format-specific: Windows
 * `arp -a`, macOS `arp -an` and Linux `ip neigh` all put the address and the
 * hardware address on the same line, and differ only in punctuation and
 * column headers. Reading a MAC-shaped token and an IPv4 token from each line
 * handles all three without three parsers.
 */
export function parseNeighbourTable(output: string, observedAt: Date = new Date()): DiscoveredClient[] {
  const clients: DiscoveredClient[] = [];
  const seen = new Set<string>();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // A half-resolved entry has no hardware address worth recording.
    if (/incomplete|invalid|unreachable/i.test(line)) continue;

    const macMatch = MAC_TOKEN.exec(line);
    const ipMatch = IPV4_TOKEN.exec(line);
    if (!macMatch || !ipMatch) continue;

    const macAddress = normalizeMac(macMatch[1]);
    const ipAddress = ipMatch[1]!;
    if (!macAddress) continue;
    if (macAddress === BROADCAST_MAC) continue;
    if (isUnroutableIpv4(ipAddress)) continue;

    const key = `${ipAddress}|${macAddress}`;
    if (seen.has(key)) continue;
    seen.add(key);

    clients.push({
      sourceName: 'neighbour-cache',
      sourceId: macAddress,
      macAddress,
      ipAddress,
      reportedName: null,
      macIsMasked: false,
      routerClientId: null,
      hasDhcpLease: null,
      interfaceType: null,
      observedAt,
    });
  }

  return clients;
}

/** The addresses of this machine, which are never devices to inventory. */
export function hostAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4') addresses.push(entry.address);
    }
  }
  return addresses;
}

/** The command that reads the neighbour table on this platform. */
export function neighbourTableCommand(): { file: string; args: string[] } {
  switch (process.platform) {
    case 'win32':
      return { file: 'arp', args: ['-a'] };
    case 'darwin':
      return { file: 'arp', args: ['-an'] };
    default:
      return { file: 'ip', args: ['neigh'] };
  }
}

export interface NeighbourCacheOptions {
  /** Reads the raw table. Overridden in tests. */
  readTable?: () => Promise<string>;
  /** The analyser's own addresses, excluded from the inventory. */
  ownAddresses?: () => string[];
}

export class NeighbourCacheSource implements DiscoverySource {
  readonly name = 'neighbour-cache' as const;
  readonly description = 'Operating system ARP/neighbour cache';

  private readonly readTable: () => Promise<string>;
  private readonly ownAddresses: () => string[];

  constructor(options: NeighbourCacheOptions = {}) {
    this.readTable = options.readTable ?? (async () => {
      const { file, args } = neighbourTableCommand();
      const { stdout } = await execFileAsync(file, args, { timeout: 10_000 });
      return stdout;
    });
    this.ownAddresses = options.ownAddresses ?? hostAddresses;
  }

  async discover(): Promise<DiscoveredClient[]> {
    const output = await this.readTable();
    const own = new Set(this.ownAddresses());
    return parseNeighbourTable(output).filter((client) => !own.has(client.ipAddress ?? ''));
  }
}
