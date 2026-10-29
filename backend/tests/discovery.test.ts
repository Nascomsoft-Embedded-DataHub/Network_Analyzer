import { describe, expect, it } from 'vitest';

import { macOui, macShortId, normalizeMac } from '../src/discovery/address.js';
import { parseNeighbourTable } from '../src/discovery/neighbourCache.js';
import {
  decodeClientRosterResponse,
  encodeClientRosterRequest,
  starlinkMessageTypes,
} from '../src/discovery/starlinkProtocol.js';
import { StarlinkRouterSource } from '../src/discovery/starlinkRouter.js';

describe('normalizeMac', () => {
  it('accepts the colon-separated upper-case form unchanged', () => {
    expect(normalizeMac('AA:BB:CC:DD:EE:FF')).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('normalises the dash-separated form the neighbour cache reports', () => {
    expect(normalizeMac('58-04-4f-aa-0b-9d')).toBe('58:04:4F:AA:0B:9D');
  });

  it('normalises the bare and dot-separated forms', () => {
    expect(normalizeMac('aabbccddeeff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMac('aabb.ccdd.eeff')).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('rejects anything that is not six octets', () => {
    expect(normalizeMac('')).toBeNull();
    expect(normalizeMac('AA:BB:CC')).toBeNull();
    expect(normalizeMac('not a mac')).toBeNull();
    expect(normalizeMac('AA:BB:CC:DD:EE:FF:11')).toBeNull();
  });
});

describe('macOui', () => {
  it('takes the first three octets as six hex digits', () => {
    expect(macOui('58:04:4F:AA:0B:9D')).toBe('58044F');
    expect(macShortId('58:04:4F:AA:0B:9D')).toBe('AA:0B:9D');
  });
});

describe('parseNeighbourTable', () => {
  it('reads the Windows arp -a format', () => {
    const output = [
      'Interface: 192.168.0.238 --- 0xa',
      '  Internet Address      Physical Address      Type',
      '  192.168.0.1           58-04-4f-aa-0b-9d     dynamic',
      '  192.168.0.24          8c-85-90-1a-2b-3c     dynamic',
      '',
    ].join('\r\n');

    const clients = parseNeighbourTable(output);
    expect(clients).toHaveLength(2);
    expect(clients[0]).toMatchObject({
      sourceName: 'neighbour-cache',
      ipAddress: '192.168.0.1',
      macAddress: '58:04:4F:AA:0B:9D',
      macIsMasked: false,
    });
    expect(clients[1]?.macAddress).toBe('8C:85:90:1A:2B:3C');
  });

  it('reads the Linux ip neigh format', () => {
    const output = [
      '192.168.0.1 dev eth0 lladdr 58:04:4f:aa:0b:9d REACHABLE',
      '192.168.0.24 dev eth0 lladdr 8c:85:90:1a:2b:3c STALE',
      '192.168.0.99 dev eth0  FAILED',
    ].join('\n');

    const clients = parseNeighbourTable(output);
    expect(clients.map((client) => client.ipAddress)).toEqual([
      '192.168.0.1',
      '192.168.0.24',
    ]);
  });

  it('reads the macOS arp -an format', () => {
    const output = '? (192.168.0.1) at 58:04:4f:aa:0b:9d on en0 ifscope [ethernet]';
    const clients = parseNeighbourTable(output);
    expect(clients[0]?.ipAddress).toBe('192.168.0.1');
    expect(clients[0]?.macAddress).toBe('58:04:4F:AA:0B:9D');
  });

  it('skips entries without a resolved hardware address', () => {
    const output = [
      '  192.168.0.13          52-54-00-12-35-67     invalid',
      '  192.168.0.14          incomplete',
    ].join('\n');
    expect(parseNeighbourTable(output)).toHaveLength(0);
  });

  it('skips the broadcast address and loopback addresses', () => {
    const output = [
      '  192.168.0.255         ff-ff-ff-ff-ff-ff     static',
      '  127.0.0.1             01-00-5e-00-00-00     static',
    ].join('\n');
    expect(parseNeighbourTable(output)).toHaveLength(0);
  });

  it('does not report the same pairing twice', () => {
    const output = [
      '  192.168.0.1           58-04-4f-aa-0b-9d     dynamic',
      '  192.168.0.1           58-04-4f-aa-0b-9d     dynamic',
    ].join('\n');
    expect(parseNeighbourTable(output)).toHaveLength(1);
  });
});

describe('starlink client roster protocol', () => {
  it('asks for the roster with the byte sequence the router expects', () => {
    // Field 3002, wire type 2, empty message: d2 bb 01 00. This is the exact
    // request a working client sends, so a change to it is a change to the
    // wire contract.
    expect(Buffer.from(encodeClientRosterRequest()).toString('hex')).toBe('d2bb0100');
  });

  it('decodes the roster the router returns', () => {
    const { response } = starlinkMessageTypes();
    const bytes = response.encode({
      status: { code: 0, message: '' },
      wifi_get_clients: {
        clients: [
          {
            name: 'living-room-tv',
            mac_address: '60:74:F4:00:00:00',
            ip_address: '192.168.1.31',
            client_id: 13,
            iface: 3,
            dhcp_lease_found: true,
            dhcp_lease_active: true,
            seconds_until_dhcp_lease_expires: 3600,
            signal_strength: -42.5,
            rx_stats: { bytes: 4096 },
            tx_stats: { bytes: 2048 },
          },
        ],
      },
    }).finish();

    const roster = decodeClientRosterResponse(Buffer.from(bytes));
    expect(roster.statusCode).toBe(0);
    expect(roster.clients).toHaveLength(1);
    expect(roster.clients[0]).toMatchObject({
      name: 'living-room-tv',
      macAddress: '60:74:F4:00:00:00',
      ipAddress: '192.168.1.31',
      clientId: 13,
      interfaceType: 'RF_5GHZ',
      dhcpLeaseFound: true,
      dhcpLeaseActive: true,
      rxBytes: 4096,
      txBytes: 2048,
    });
  });

  it('reads an empty roster as an empty list rather than an error', () => {
    const { response } = starlinkMessageTypes();
    const bytes = response.encode({ status: { code: 0 } }).finish();
    const roster = decodeClientRosterResponse(Buffer.from(bytes));
    expect(roster.clients).toEqual([]);
  });
});

describe('StarlinkRouterSource', () => {
  const rosterResponse = (
    clients: {
      name?: string;
      mac_address?: string;
      ip_address?: string;
      client_id?: number;
      iface?: number;
      dhcp_lease_found?: boolean;
      dhcp_lease_active?: boolean;
    }[],
    statusCode = 0,
  ): Buffer => {
    const { response } = starlinkMessageTypes();
    return Buffer.from(
      response.encode({ status: { code: statusCode }, wifi_get_clients: { clients } }).finish(),
    );
  };

  it('identifies clients by the router client id, never by the masked address', async () => {
    const source = new StarlinkRouterSource({
      call: async () =>
        rosterResponse([
          {
            name: 'bedroom-lamp',
            mac_address: '7C:A6:B6:00:00:00',
            ip_address: '192.168.1.41',
            client_id: 21,
            dhcp_lease_found: true,
            dhcp_lease_active: true,
          },
        ]),
    });

    const clients = await source.discover();
    expect(clients[0]?.sourceName).toBe('starlink-router');
    expect(clients[0]?.routerClientId).toBe(21);
    expect(clients[0]?.sourceId).toBe('cid:21');
    expect(clients[0]?.hasDhcpLease).toBe(true);
  });

  it('marks an address as masked when the router blanks its low octets', async () => {
    const source = new StarlinkRouterSource({
      call: async () =>
        rosterResponse([
          {
            name: 'lamp',
            mac_address: '7C:A6:B6:00:00:00',
            ip_address: '192.168.1.41',
            client_id: 21,
          },
        ]),
    });

    const clients = await source.discover();
    expect(clients[0]?.macIsMasked).toBe(true);
  });

  it('marks an address as masked when two clients report the same one', async () => {
    const source = new StarlinkRouterSource({
      call: async () =>
        rosterResponse([
          { name: 'lamp one', mac_address: '7C:A6:B6:11:22:33', ip_address: '192.168.1.41', client_id: 21 },
          { name: 'lamp two', mac_address: '7C:A6:B6:11:22:33', ip_address: '192.168.1.42', client_id: 22 },
        ]),
    });

    const clients = await source.discover();
    expect(clients.every((client) => client.macIsMasked)).toBe(true);
  });

  it('reports a refused call rather than an empty roster', async () => {
    const source = new StarlinkRouterSource({
      call: async () => rosterResponse([], 7),
    });
    await expect(source.discover()).rejects.toThrow(/status 7/);
  });
});
