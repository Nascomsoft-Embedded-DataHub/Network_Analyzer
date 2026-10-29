# Network Analyser

Network visibility for authorized Starlink network administrators — bandwidth consumption, device connections, and network health, without crossing into covert surveillance. The analyzer operates strictly on headers and metadata and never inspects payload contents.

**Nascomsoft Embedded Hub — Data Department** · 7-day MVP sprint ([roadmap](docs/network-analyser-1-week-roadmap.md) · [team split](docs/network-analyser-team-split-guide.md))

## How it runs

The analyser runs **on the administrator's own machine** — a laptop — and the dashboard is a responsive web app used from that laptop and from an Android phone on the same network. The Starlink link is never in the data path, and telemetry never leaves the device. See [ADR 0001](docs/adr/0001-deployment-model.md).

The API binds to loopback by default. Set `HOST=0.0.0.0` only when the phone needs to reach it — and note the warning about authentication in [`.env.example`](backend/.env.example).

## Device discovery

The backend discovers attached devices from two sources at once, and merges them into one inventory:

- **The host's ARP/neighbour cache** — reports true hardware addresses, but only for devices this machine has actually spoken to.
- **The router's client roster**, read over the Starlink router's local gRPC control plane — reports every attached device with its lease state and traffic counters, but masks each MAC down to the vendor OUI.

Neither is sufficient alone, so a device is identified by the strongest basis available — hardware address, then the router's own client id, then IP — and is re-anchored in place when a stronger one is learned. One device is one row, however many times the pipeline runs. See [ADR 0002](docs/adr/0002-device-identity.md).

Enable the sources with `DISCOVERY_SOURCES=neighbour-cache,starlink-router`; `simulated` stands in for a router in development and tests.

## Repository layout

```
packages/contracts   Shared API contracts (Zod schemas, types, mock data) — source of truth for both tracks
backend/             Fastify API + PostgreSQL (Drizzle ORM): devices, usage, health, alerts
frontend/            Dashboard web app (Vite + React + TypeScript) — laptop and Android phone
docs/                Roadmap, team split guide, API contracts, frontend spec, ADRs
```

## Local setup

```bash
npm install                 # installs both workspaces
docker compose up -d db     # local PostgreSQL 16
cp backend/.env.example backend/.env
npm run db:migrate          # apply the schema
npm run dev                 # API on :3000 and dashboard on :5173, side by side
```

## Verification

```bash
npm run typecheck
npm run test
```

## Working on this repo

Read [CONTRIBUTING.md](CONTRIBUTING.md) before your first commit — branch naming, the 4:00 PM PR sync, and the API-contracts-first rule are all in there.

## Documents

| Document | Description |
|---|---|
| [1-Week MVP Build Roadmap](docs/network-analyser-1-week-roadmap.md) | Locked MVP scope, privacy directives, the 7-day sprint plan, and pilot success criteria. |
| [Team Split Guide](docs/network-analyser-team-split-guide.md) | The 2-developer parallel sprint split, GitHub collaboration protocol, and integration checkpoints. |
| [API Contracts](docs/api-contracts.md) | Every endpoint's JSON shape — the frontend track builds against these. |
| [Frontend Spec](docs/frontend-spec.md) | Device model (laptop + Android phone), responsive and PWA requirements, connection states. |
| [ADR 0001](docs/adr/0001-deployment-model.md) | Deployment model and device roles, and what they constrain for Day 2 discovery. |
| [ADR 0002](docs/adr/0002-device-identity.md) | How the router's masked MAC addresses are handled, and how a device is identified across sources. |

The original PDFs are retained at the repository root alongside the Markdown conversions.
