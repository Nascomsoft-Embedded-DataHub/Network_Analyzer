import protobuf from 'protobufjs';

/**
 * The slice of Starlink's router gRPC schema that the analyser reads.
 *
 * Starlink publishes no schema for its local control plane, so this file is a
 * transcription of the router's own descriptor set, reduced to the calls the
 * analyser makes. Field numbers are the contract on the wire and are taken
 * verbatim from the router: `wifi_get_clients` is 3002 on both the request and
 * the response side, and the DHCP-lease fields sit at 46 to 49.
 *
 * The router answers every request through one method and picks the branch of
 * the response by the field number it was asked for. A call it refuses comes
 * back as a non-zero status code rather than as a transport error, which is
 * how a firmware that does not implement a call says so.
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
    SpeedTestRequest speed_test = 1003;
    WifiGetPingMetricsRequest wifi_get_ping_metrics = 3007;
  }
}

message Response {
  oneof response {
    WifiGetClientsResponse wifi_get_clients = 3002;
    SpeedTestResponse speed_test = 1003;
    WifiGetPingMetricsResponse wifi_get_ping_metrics = 3007;
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

// ---- Speed test ----
//
// The router measures the link itself: it runs the transfer and reports the
// rate it sustained, together with the latency it saw while doing so. This is
// the only capacity measurement available without sending traffic to a third
// party, which the analyser's privacy rules rule out.

message SpeedTestRequest {}

message SpeedTestResponse {
  float download_bps = 1;
  float upload_bps = 2;
  float latency_s = 3;
}

// ---- Ping metrics ----
//
// The router's own view of how well the internet is reachable: the mean
// round-trip time it measures, how often its probes are dropped, and how long
// it has been since the last probe that got through.

message WifiGetPingMetricsRequest {}

message WifiGetPingMetricsResponse {
  PingMetrics internet = 1;
}

message PingMetrics {
  float latency_mean_ms = 1;
  float latency_stddev_ms = 2;
  float latency_mean_ms_5m = 3;
  float latency_mean_ms_1h = 4;
  float latency_mean_ms_1d = 5;
  float drop_rate = 6;
  float drop_rate_5m = 7;
  float drop_rate_1h = 8;
  float drop_rate_1d = 9;
  float seconds_since_last_success = 10;
  float seconds_since_last_1s_outage = 11;
  float seconds_since_last_5s_outage = 12;
  float happy_hours_1s_1d = 13;
  float happy_hours_5s_1d = 14;
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
  associatedTimeSeconds: number;
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
      associatedTimeSeconds: Number(client.associated_time_s ?? 0),
    });
  }

  return {
    statusCode: Number(plain.status?.code ?? 0),
    statusMessage: String(plain.status?.message ?? ''),
    clients,
  };
}

// ---- Speed test ----

/** The router's answer to a speed-test request. */
export interface RouterSpeedTest {
  /** Sustained downstream rate, in bits per second. */
  downloadBps: number;
  /** Sustained upstream rate, in bits per second. */
  uploadBps: number;
  /** The latency the router saw while measuring, in seconds. */
  latencySeconds: number;
}

/**
 * Encode a request for the router to measure the link.
 *
 * The request body is empty; the branch is what selects the call.
 */
export function encodeSpeedTestRequest(): Buffer {
  const { request } = starlinkMessageTypes();
  const payload = request.encode({ speed_test: {} }).finish();
  return Buffer.from(payload);
}

/**
 * Decode the router's answer to a speed-test request.
 *
 * A router that does not implement the call answers with a status rather than
 * with a measurement, which is reported as a null result alongside the status
 * code so the caller can tell "refused" from "measured zero".
 */
export function decodeSpeedTestResponse(bytes: Buffer): {
  statusCode: number;
  statusMessage: string;
  speedTest: RouterSpeedTest | null;
} {
  const { response } = starlinkMessageTypes();
  const message = response.decode(bytes);
  const plain = response.toObject(message, {
    longs: Number,
    enums: String,
    bytes: Array,
    defaults: true,
  }) as {
    status?: { code?: number; message?: string };
    speed_test?: { download_bps?: number; upload_bps?: number; latency_s?: number };
  };

  const statusCode = Number(plain.status?.code ?? 0);
  const statusMessage = String(plain.status?.message ?? '');
  const measured = plain.speed_test;
  if (!measured) {
    return { statusCode, statusMessage, speedTest: null };
  }

  return {
    statusCode,
    statusMessage,
    speedTest: {
      downloadBps: Number(measured.download_bps ?? 0),
      uploadBps: Number(measured.upload_bps ?? 0),
      latencySeconds: Number(measured.latency_s ?? 0),
    },
  };
}

// ---- Ping metrics ----

/** The router's own measurement of how well the internet is reachable. */
export interface RouterPingMetrics {
  /** Mean round-trip time, in milliseconds. */
  latencyMeanMs: number;
  /** The proportion of probes that were dropped, from 0 to 1. */
  dropRate: number;
  /** Seconds since a probe last got through. */
  secondsSinceLastSuccess: number;
}

/**
 * Encode a request for the router's ping metrics.
 *
 * The request body is empty; the branch is what selects the call.
 */
export function encodePingMetricsRequest(): Buffer {
  const { request } = starlinkMessageTypes();
  const payload = request.encode({ wifi_get_ping_metrics: {} }).finish();
  return Buffer.from(payload);
}

/**
 * Decode the router's answer to a ping-metrics request.
 *
 * As with the speed test, a router that does not implement the call answers
 * with a status rather than with a measurement.
 */
export function decodePingMetricsResponse(bytes: Buffer): {
  statusCode: number;
  statusMessage: string;
  metrics: RouterPingMetrics | null;
} {
  const { response } = starlinkMessageTypes();
  const message = response.decode(bytes);
  const plain = response.toObject(message, {
    longs: Number,
    enums: String,
    bytes: Array,
    defaults: true,
  }) as {
    status?: { code?: number; message?: string };
    wifi_get_ping_metrics?: {
      internet?: {
        latency_mean_ms?: number;
        drop_rate?: number;
        seconds_since_last_success?: number;
      };
    };
  };

  const statusCode = Number(plain.status?.code ?? 0);
  const statusMessage = String(plain.status?.message ?? '');
  const internet = plain.wifi_get_ping_metrics?.internet;
  if (!internet) {
    return { statusCode, statusMessage, metrics: null };
  }

  return {
    statusCode,
    statusMessage,
    metrics: {
      latencyMeanMs: Number(internet.latency_mean_ms ?? 0),
      dropRate: Number(internet.drop_rate ?? 0),
      secondsSinceLastSuccess: Number(internet.seconds_since_last_success ?? 0),
    },
  };
}
