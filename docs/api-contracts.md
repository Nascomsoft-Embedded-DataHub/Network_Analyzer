# Network Analyser — API Contracts

**Audience:** Frontend track (Glory). Build every screen against these shapes with mock data until the endpoints go live.

**Source of truth:** `packages/contracts/src/` (Zod schemas). This document is derived from those schemas — if they disagree, the code wins and this file needs updating. The backend validates every request and response against the same schemas at runtime, so a shape change shows up as a `400` rather than silent drift.

**Mock data:** ready-made fixtures that validate against these schemas live in `packages/contracts/src/mock.ts` — import them directly, or copy the payloads below.

**Updated for Day 4:** the session endpoints are live, and every endpoint except the sign-in, the liveness probe and the analyser-identity endpoint now requires a session token. See [ADR 0004](adr/0004-sessions-and-access-control.md) for why the session works this way.

---

## Conventions

- **Base URL:** `http://localhost:3000`
- All timestamps are **ISO-8601 with UTC offset**: `2026-10-27T09:15:00.000Z`
- All list endpoints return a paginated envelope: `{ data: [...], meta: { total, limit, offset } }`
- All errors use one envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { "issues": [{ "path": "limit", "message": "Invalid input" }] }
  }
}
```

Error codes: `VALIDATION_ERROR` (400), `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `INTERNAL_ERROR` (500), `AUTH_NOT_CONFIGURED` (503).

- MAC addresses are **uppercase, colon-delimited**: `AA:BB:CC:11:22:33`
- Byte counts are integers (not humanised strings) — format on the client.

### Authentication

**Every endpoint requires a session token except `POST /api/auth/login`, `GET /api/health-check` and `GET /api/system/info`.** A request without one is refused with `401 UNAUTHORIZED` before any handler runs, so an unauthenticated caller makes the analyser do no work at all.

The three public endpoints are the ones a client needs before it has a token: the sign-in itself, a liveness probe, and the analyser's own identity — which the sign-in screen needs to confirm it is pointed at the right machine before anybody has signed in. None of them reveals anything about the devices on the network.

Send the token as a bearer credential on every call:

```
Authorization: Bearer <token>
```

Three endpoints additionally require an **administrator** session and answer `403 FORBIDDEN` for a viewer:

| Endpoint | Who may call it |
|---|---|
| `PATCH /api/devices/:id/known` | admin |
| `PATCH /api/alerts/:id/acknowledge` | admin |
| `PUT /api/alerts/rules` | admin |

A viewer may read every other endpoint in this document.

---

## Devices

### `GET /api/devices`

Query parameters: `status` (`online|offline|unknown`), `isKnown` (`true|false`), `search` (matches hostname, IP or MAC), `limit` (1–200, default 50), `offset` (default 0).

```json
{
  "data": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "identityKey": "mac:AA:BB:CC:11:22:33",
      "ipAddress": "192.168.1.21",
      "macAddress": "AA:BB:CC:11:22:33",
      "hostname": "ike-iphone",
      "vendor": "Apple, Inc.",
      "isKnown": true,
      "status": "online",
      "firstSeenAt": "2026-10-20T07:12:00.000Z",
      "lastSeenAt": "2026-10-27T09:15:00.000Z"
    }
  ],
  "meta": { "total": 5, "limit": 50, "offset": 0 }
}
```

`status: "unknown"` + `isKnown: false` is the **unknown-device** case that drives the alerts panel.

**`identityKey`** says what the device is known by, as `<basis>:<value>`, and therefore how far the record can be trusted:

| Basis | Meaning | `macAddress` alongside it |
|---|---|---|
| `mac:AA:BB:CC:DD:EE:FF` | A real hardware address — the strongest basis. | The device's own address. |
| `cid:21` | The router's client id, for a device never seen with a hardware address. | Masked to the vendor OUI, or `null`. **Not** the device's real address — do not present it as one. |
| `ip:192.168.1.21` | Known only by its network address. | `null`. |

A device's basis is upgraded in place when a stronger one is learned, so `identityKey` changes over a device's life while `id` does not. `macAddress` is `null` whenever no hardware address is known — the dashboard must render a placeholder rather than assume a value.

### `GET /api/devices/:id`

Same envelope as the list, with a single object: `{ "data": { ...device } }`. Returns `404` when the id does not exist.

### `PATCH /api/devices/:id/known`

Marks a device as known (suppresses unknown-device alerts). Body:

```json
{ "isKnown": true }
```

Response: `{ "data": { ...device } }` with the updated flag.

---

## Usage

### `GET /api/usage`

Per-device hourly consumption buckets. Query: `deviceId`, `from`, `to` (ISO timestamps), `limit` (1–1000, default 500), `offset`.

```json
{
  "data": [
    {
      "id": "a0000000-0000-4000-8000-000000000001",
      "deviceId": "22222222-2222-4222-8222-222222222222",
      "bucketStart": "2026-10-27T07:00:00.000Z",
      "uploadBytes": 52428800,
      "downloadBytes": 1073741824,
      "totalBytes": 1126170624
    }
  ],
  "meta": { "total": 6, "limit": 500, "offset": 0 }
}
```

Invariant: `totalBytes === uploadBytes + downloadBytes`.

The buckets are derived from the router's **cumulative** counters: a bucket
holds the difference between two readings, never a reading. The first reading
of a device is therefore a baseline and counts for nothing, and traffic that
moved while the analyser was not running is spread across the hours it could
have happened in. Buckets are kept for seven days
(`TELEMETRY_USAGE_RETENTION_DAYS`). See
`docs/adr/0003-telemetry-measurement.md`.

### `GET /api/usage/timeline`

Network-wide totals for the **peak-usage timeline** chart. Query: `granularity` (`hour|day`, default `hour`), `from`, `to`. Defaults to the last 7 days.

```json
{
  "data": [
    {
      "bucketStart": "2026-10-27T08:00:00.000Z",
      "totalBytes": 2252341248,
      "uploadBytes": 104857600,
      "downloadBytes": 2147483648
    }
  ],
  "meta": {
    "granularity": "hour",
    "from": "2026-10-20T09:00:00.000Z",
    "to": "2026-10-27T15:00:00.000Z"
  }
}
```

### `GET /api/usage/summary`

Totals for one device over a window. Query: `deviceId` (**required**), `from`, `to`.

```json
{
  "data": {
    "deviceId": "22222222-2222-4222-8222-222222222222",
    "from": "2026-10-20T09:00:00.000Z",
    "to": "2026-10-27T15:00:00.000Z",
    "uploadBytes": 209715200,
    "downloadBytes": 4294967296,
    "totalBytes": 4504682496
  }
}
```

---

## Health

### `GET /api/health`

Historical samples. Query: `deviceId` (omit for network-wide only), `from`, `to`, `limit`, `offset`.

```json
{
  "data": [
    {
      "id": "b0000000-0000-4000-8000-000000000001",
      "deviceId": null,
      "timestamp": "2026-10-27T09:15:00.000Z",
      "latencyMs": 18.4,
      "downloadMbps": 412.7,
      "uploadMbps": 96.3,
      "uptimeSeconds": 86400
    }
  ],
  "meta": { "total": 2, "limit": 500, "offset": 0 }
}
```

`deviceId: null` means a **network-wide** measurement.

### `GET /api/health/snapshot`

Latest sample, rolled up for the status widget.

```json
{
  "data": {
    "timestamp": "2026-10-27T09:15:00.000Z",
    "latencyMs": 18.4,
    "downloadMbps": 412.7,
    "uploadMbps": 96.3,
    "uptimeSeconds": 86400,
    "status": "healthy"
  }
}
```

`status` bands, defined once in `@network-analyser/contracts` so that this endpoint and the dashboard cannot disagree about the same reading:

| band | condition |
| --- | --- |
| `healthy` | latency ≤ 50 ms **and** ≥ 10 Mbps down |
| `degraded` | latency ≤ 200 ms **and** ≥ 1 Mbps down |
| `down` | anything else |

Returns `404` before the first measurement is ingested — handle the empty state.

### What the health figures mean

The throughput figures are the link's **capacity** — what it can carry — not
what it is carrying. A network carrying nothing is perfectly healthy, and a
dashboard that reported it as having no bandwidth would be wrong.

- `latencyMs` — round-trip latency, from the router's ping metrics.
- `downloadMbps` / `uploadMbps` — the capacity the router's own speed test
  sustains.
- `uptimeSeconds` — the analyser's own unbroken run of successful probes,
  reset to zero whenever a probe fails. Not the router's uptime counter.

A measurement that could not be taken is **not** written as a zero: a
reading missing any of its figures is dropped, so the series can show a gap
rather than a false reading. The sampler runs every five minutes by default
(`TELEMETRY_HEALTH_INTERVAL_SECONDS`).

The full measurement model is in `docs/adr/0003-telemetry-measurement.md`.

---

## Alerts

### `GET /api/alerts`

Query: `type` (`unknown_device|high_usage`), `severity` (`info|warning|critical`), `unacknowledged` (`true|false`), `limit`, `offset`.

```json
{
  "data": [
    {
      "id": "c0000000-0000-4000-8000-000000000001",
      "type": "unknown_device",
      "severity": "warning",
      "message": "New device detected on the network",
      "deviceId": "55555555-5555-4555-8555-555555555555",
      "thresholdBytes": null,
      "observedBytes": null,
      "triggeredAt": "2026-10-27T06:33:00.000Z",
      "acknowledgedAt": null
    }
  ],
  "meta": { "total": 2, "limit": 50, "offset": 0 }
}
```

For `high_usage` alerts, `thresholdBytes` and `observedBytes` are populated; both are `null` for `unknown_device`. `acknowledgedAt` is `null` until acknowledged.

### `PATCH /api/alerts/:id/acknowledge`

Body: `{ "acknowledged": true }`. Response: the alert with `acknowledgedAt` set.

### `GET /api/alerts/rules`

```json
{
  "data": [
    {
      "id": "d0000000-0000-4000-8000-000000000001",
      "type": "unknown_device",
      "enabled": true,
      "thresholdBytes": null,
      "severity": "warning",
      "updatedAt": "2026-10-27T07:00:00.000Z"
    }
  ]
}
```

### `PUT /api/alerts/rules`

Upserts a rule by `type`. Body:

```json
{
  "type": "high_usage",
  "enabled": true,
  "thresholdBytes": 5368709120,
  "severity": "critical"
}
```

---

## Auth

### `POST /api/auth/login`

The only public endpoint besides `GET /api/health-check` and `GET /api/system/info`.

```json
{ "email": "admin@example.com", "password": "at-least-8-chars" }
```

Response:

```json
{
  "data": {
    "user": {
      "id": "e0000000-0000-4000-8000-000000000001",
      "name": "Pilot Admin",
      "email": "admin@example.com",
      "role": "admin"
    },
    "token": "v1.eyJ2IjoxLCJzdWIiOiJlMDAwMDAwMC0wMDAwLTAwMDQtODExMS0xMTExMTExMTExMTEifQ.9Nq…",
    "expiresAt": "2026-10-28T09:15:00.000Z"
  }
}
```

`role` is `admin | viewer` — the RBAC UI gates on this. `token` is the bearer credential to send on every later call.

Failures:

| Status | Code | When |
|---|---|---|
| `401` | `INVALID_CREDENTIALS` | The address and password do not match an account. The same reply is given for an unknown address, so the endpoint cannot be used to discover which addresses exist. |
| `503` | `AUTH_NOT_CONFIGURED` | No administrator password is configured on this analyser. Set `ANALYSER_ADMIN_PASSWORD` and restart it. |

The `503` is worth distinguishing from a rejected password: "your password is wrong" and "nobody has set one up yet" are very different problems for whoever is reading the message.

### `GET /api/auth/session`

Requires a session token. Renews the session the client already holds and returns the current identity — so a dashboard left open on a phone stays signed in without the administrator signing in again.

The response shape is identical to the login response: `{ data: { user, token, expiresAt } }`, with a **fresh** token and a fresh expiry.

A token that is malformed, forged or expired is refused with `401 UNAUTHORIZED`, and the client should treat that as "sign in again" rather than as an error to display. Renewal only applies to a token that is still valid — an expired session cannot be renewed, only replaced by signing in again.

---

## System

### `GET /api/system/info`

Identifies the analyser instance. The dashboard may be open on the Android phone while the analyser runs on the laptop, so the client needs a way to confirm it is talking to the right machine.

```json
{
  "data": {
    "version": "0.1.0",
    "startedAt": "2026-10-27T14:45:00.000Z",
    "uptimeSeconds": 1802,
    "bindHost": "127.0.0.1",
    "bindPort": 3000,
    "hostname": "STANLEY-LAPTOP",
    "runtime": { "nodeVersion": "v24.19.0", "platform": "win32 x64" },
    "loopbackOnly": true
  }
}
```

`loopbackOnly: false` means other devices on the network can reach the API — show that in the diagnostics panel.

---

## Frontend quick start

```ts
import { MOCK_DEVICES, MOCK_USAGE, MOCK_ALERTS } from '@network-analyser/contracts';
```

Every fixture validates against its schema, so components built on these shapes survive the Day 5 swap to live endpoints.

**Questions or a shape that doesn't work for a chart?** Raise it before building around it — contract changes are cheap today and expensive on Day 5.

---

## Related documents

- [`frontend-spec.md`](frontend-spec.md) — the device model (laptop + Android phone), responsive and PWA requirements, and connection states.
- [`adr/0001-deployment-model.md`](adr/0001-deployment-model.md) — why the analyser runs on the administrator's own machine, and what that constrains.
