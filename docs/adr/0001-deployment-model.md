# ADR 0001 — Deployment model and device roles

- **Status:** Accepted
- **Date:** 2026-10-27 (Day 1)
- **Resolves:** Roadmap Day 1 activity — "Finalize the deployment option (router integration vs. hybrid)"

## Context

The MVP runs for 7 days against a controlled pilot network and must be operated by a network administrator, not by an engineer. Two constraints pull in opposite directions:

- The roadmap requires the analyser to add **no noticeable latency to the host Starlink connection**. The analyser therefore cannot sit inline on the traffic path.
- The privacy directives forbid payload inspection, and the product must not "cross into covert surveillance". Whatever collects the data should hold as little as possible.

Separately, the administrator works from more than one device: a **laptop** and an **Android phone**. Both are admin devices.

## Decision

**Hybrid deployment.** The analyser runs on the administrator's own machine, and the dashboard is a responsive web app served to whichever admin device is in use.

| Role | Device | Runs |
|---|---|---|
| Analyser (backend + ingestion) | Administrator's laptop | Node service, local PostgreSQL |
| Admin client (dashboard) | Laptop browser | Responsive web app |
| Admin client (dashboard) | Android phone browser | Same web app, installable (PWA) |

The phone is a **client only** — it renders the dashboard and talks to the laptop's API over the local network. The analyser is not installed on the phone. (Running the backend on the phone via Termux is possible but adds setup friction for a non-technical pilot administrator, and is out of scope for the MVP.)

The API binds to **loopback by default**. Binding to the LAN interface is an explicit opt-in (`HOST=0.0.0.0`) needed only when the phone must reach it.

## Consequences

**Good:**

- The Starlink link is never in the data path. Nothing is tapped, proxied, or mirrored, so the performance criterion is satisfied by construction rather than by tuning.
- Telemetry never leaves the administrator's machine. The 24-hour granular-data drop and the "no covert surveillance" boundary are both easier to hold, and easier to demonstrate to a pilot partner.
- No staging cloud environment is required, which removes a dependency the 7-day plan could not otherwise absorb.
- The dashboard is a single codebase serving both device classes.

**Accepted costs:**

- **The device inventory is only as good as the discovery method.** See below.
- **The phone only works on the same network as the analyser.** Remote access when the administrator is off-site is not supported by the MVP. This is a scope limit, not an oversight — remote access is out of scope, and adding a tunnel or public endpoint would conflict with the privacy posture.
- **Before authentication lands, a LAN-bound API exposes the device inventory to every device on the network.** `HOST` therefore defaults to loopback, and the service logs a warning when bound beyond loopback. Keep the analyser on a trusted network until the auth phase.
- The phone's browser reports its own origin to CORS, so `CORS_ORIGIN` must include the laptop's LAN address, not just `localhost`.

## Discovery strategy (constrains Day 2)

Because the analyser sits on the administrator's machine rather than on the router, it discovers devices from **metadata the host OS already exposes**, never from captured traffic:

1. **ARP / neighbour cache** (`arp -a` on Windows and macOS, `ip neigh` on Linux) — the mapping of IP to MAC that the host already holds.
2. **The router's DHCP lease table** — the complete set of devices that have joined the network, including ones the host has never spoken to.
3. **Hostname and vendor resolution** from the MAC address OUI, applied at ingest time.

**Accuracy caveat, and why it matters for the success criteria.** The ARP cache only contains devices the host has communicated with, or that have been recently active. On its own it will under-report the network, which threatens the roadmap's ">90% accuracy" criterion for device identification. The DHCP lease table is what closes that gap, and it is the difference between a device list that is nearly complete and one that is quietly missing devices.

**This is the main open technical question for Day 2:** confirm that the pilot network's router exposes its DHCP lease table to the administrator (SNMP, a status page, or a file export). If it does not, the inventory has to be built from the neighbour cache alone and the accuracy criterion needs re-scoping, or another discovery source is needed.

## What this ADR does not decide

- How the network-wide health metrics are collected (the roadmap's "router integration vs. hybrid" also touches this).
- Remote access from outside the local network.
- The authentication mechanism, which lands in a later sprint phase.
