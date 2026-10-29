# Network Analyser — API Contracts (Day 1)

**Audience:** Frontend track (Glory). Build every screen against these shapes with mock data until the endpoints go live.

**Source of truth:** `packages/contracts/src/` (Zod schemas). This document is derived from those schemas — if they disagree, the code wins and this file needs updating. The backend validates every request and response against the same schemas at runtime, so a shape change shows up as a `400` rather than silent drift.

**Mock data:** ready-made fixtures that validate against these schemas live in `packages/contracts/src/mock.ts` — import them directly, or copy the payloads below.

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

Error codes: `VALIDATION_ERROR` (400), `NOT_FOUND` (404), `INTERNAL_ERROR` (500).

- MAC addresses are **uppercase, colon-delimited**: `AA:BB:CC:11:22:33`
- Byte counts are integers (not humanised strings) — format on the client.

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

`status` bands: `healthy` (latency ≤ 50 ms and ≥ 10 Mbps down), `degraded`, `down`. Returns `404` before the first measurement is ingested — handle the empty state.

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

## Auth (Day 4)

### `POST /api/auth/login`

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
    "expiresAt": "2026-10-28T09:15:00.000Z"
  }
}
```

`role` is `admin | viewer` — the RBAC UI gates on this. Day 1 ships a hard-coded admin session shape; token issuance lands later.

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
