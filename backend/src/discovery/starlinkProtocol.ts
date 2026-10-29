import protobuf from 'protobufjs';

/**
 * The slice of Starlink's router gRPC schema that the analyser reads.
 *
 * Starlink publishes no schema for its local control plane, so this file is a
 * transcription of the router's own descriptor set, reduced to the one call
 * the analyser makes. Field numbers are the contract on the wire and are
 * taken verbatim from the router: `wifi_get_clients` is 3002 on both the
 * request and the response side, and the DHCP-lease fields sit at 46 to 49.
 *
 * Only the fields the analyser uses are declared. The wire format of an
 * undeclared field number is still passed through untouched, so a router that
 * grows new fields answers without complaint.
 */
export const STARLINK_ROUTER_PROTO = `
syntax = "proto3";

package SpaceX.API.Device;

service Device {
  rpc Handle(Request) returns (Response);
}

message Request {
  oneof request {
    WifiGetClientsRequest wifi_get_clients = 3002;
  }
}

message Response {
  oneof response {
    WifiGetClientsResponse wifi_get_clients = 3002;
  }
  // Mirrors SpaceX.API.Status.Status on the wire: same field numbers, same
  // types. The router answers a call it refuses with a non-zero code here
  // rather than with a transport-level error.
  Status status = 2;
}

message Status {
  int32 code = 1;
  string message = 2;
}

message WifiGetClientsRequest {}

message WifiGetClientsResponse {
  repeated WifiClient clients = 1;
  bool has_client_index = 2;
  int32 client_index = 3;
}

message WifiClient {
  // Name the router reports for the client, which is the DHCP hostname.
  string name = 1;
  // Vendor OUI with the low three octets blanked on current firmware.
  string mac_address = 2;
  string ip_address = 3;
  float signal_strength = 4;
  RxStats rx_stats = 5;
  TxStats tx_stats = 6;
  uint32 associated_time_s = 7;
  string mode_str = 8;
  Interface iface = 9;
  string device_id = 15;
  string iface_name = 26;
  // The router's own per-client identifier. Stable while the client stays
  // associated, and the only identifier that survives MAC masking.
  uint32 client_id = 43;
  bool dhcp_lease_active = 46;
  bool dhcp_lease_renewed = 47;
  float seconds_until_dhcp_lease_expires = 48;
  bool dhcp_lease_found = 49;
  uint32 upload_mb = 54;
  uint32 download_mb = 55;
  bool active = 58;

  message RxStats {
    uint64 bytes = 1;
    uint64 count_errors = 2;
  }

  message TxStats {
    uint64 bytes = 1;
    uint64 success_bytes = 2;
  }

  enum Interface {
    UNKNOWN = 0;
    ETH = 1;
    RF_2GHZ = 2;
    RF_5GHZ = 3;
    RF_5GHZ_HIGH = 4;
  }
}
`;

let cached: { request: protobuf.Type; response: protobuf.Type } | null = null;

/**
 * The request and response message types, parsed once per process.
 *
 * Parsing is not free and the listener polls the router on a timer, so the
 * result is memoised.
 */
export function starlinkMessageTypes(): {
  request: protobuf.Type;
  response: protobuf.Type;
} {
  if (cached) return cached;
  // `keepCase` matters: without it protobuf.js camel-cases every field name,
  // and the decoded keys would no longer match the field names on the wire.
  const parsed = protobuf.parse(STARLINK_ROUTER_PROTO, { keepCase: true });
  cached = {
    request: parsed.root.lookupType('SpaceX.API.Device.Request'),
    response: parsed.root.lookupType('SpaceX.API.Device.Response'),
  };
  return cached;
}

/** A client entry as the router reports it. */
export interface RouterClient {
  name: string;
  macAddress: string;
  ipAddress: string;
  signalStrength: number;
  clientId: number;
  interfaceType: string;
  dhcpLeaseFound: boolean;
  dhcpLeaseActive: boolean;
  secondsUntilLeaseExpires: number;
  rxBytes: number;
  txBytes: number;
}

/** The router's answer to a client-roster request. */
export interface RouterClientRoster {
  statusCode: number;
  statusMessage: string;
  clients: RouterClient[];
}

/**
 * Encode a request for the client roster.
 *
 * The request carries nothing but the oneof branch: the router accepts a
 * `wifi_get_clients` with an empty body and answers with the full roster.
 */
export function encodeClientRosterRequest(): Buffer {
  const { request } = starlinkMessageTypes();
  const payload = request.encode({ wifi_get_clients: {} }).finish();
  return Buffer.from(payload);
}

/**
 * Decode the router's answer.
 *
 * Unknown fields are ignored, so a firmware that adds fields still decodes.
 * A response whose roster branch is absent is an empty roster rather than an
 * error — the router uses that shape when no client is associated.
 */
export function decodeClientRosterResponse(bytes: Buffer): RouterClientRoster {
  const { response } = starlinkMessageTypes();
  const message = response.decode(bytes);
  const plain = response.toObject(message, {
    longs: Number,
    enums: String,
    bytes: Array,
    defaults: true,
  }) as {
    status?: { code?: number; message?: string };
    wifi_get_clients?: { clients?: unknown[] };
  };

  const roster = plain.wifi_get_clients?.clients ?? [];
  const clients: RouterClient[] = [];
  for (const entry of roster) {
    const client = entry as Record<string, unknown>;
    const rxStats = client.rx_stats as Record<string, unknown> | undefined;
    const txStats = client.tx_stats as Record<string, unknown> | undefined;
    clients.push({
      name: String(client.name ?? ''),
      macAddress: String(client.mac_address ?? ''),
      ipAddress: String(client.ip_address ?? ''),
      signalStrength: Number(client.signal_strength ?? 0),
      clientId: Number(client.client_id ?? 0),
      interfaceType: String(client.iface ?? 'UNKNOWN'),
      dhcpLeaseFound: Boolean(client.dhcp_lease_found),
      dhcpLeaseActive: Boolean(client.dhcp_lease_active),
      secondsUntilLeaseExpires: Number(client.seconds_until_dhcp_lease_expires ?? 0),
      rxBytes: Number(rxStats?.bytes ?? 0),
      txBytes: Number(txStats?.bytes ?? 0),
    });
  }

  return {
    statusCode: Number(plain.status?.code ?? 0),
    statusMessage: String(plain.status?.message ?? ''),
    clients,
  };
}
