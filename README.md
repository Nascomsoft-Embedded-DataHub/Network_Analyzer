# Network Analyser

Network visibility for authorized Starlink network administrators — bandwidth consumption, device connections, and network health, without crossing into covert surveillance. The analyzer operates strictly on headers and metadata and never inspects payload contents.

**Nascomsoft Embedded Hub — Data Department** · 7-day MVP sprint ([roadmap](docs/network-analyser-1-week-roadmap.md) · [team split](docs/network-analyser-team-split-guide.md))

## Repository layout

```
packages/contracts   Shared API contracts (Zod schemas, types, mock data) — source of truth for both tracks
backend/             Fastify API + PostgreSQL (Drizzle ORM): devices, usage, health, alerts
docs/                Roadmap, team split guide, API contracts
```

## Local setup

```bash
npm install                 # installs both workspaces
docker compose up -d db     # local PostgreSQL 16
cp backend/.env.example backend/.env
npm run db:migrate          # apply the schema
npm run dev                 # API on http://localhost:3000
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

The original PDFs are retained at the repository root alongside the Markdown conversions.
