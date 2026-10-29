# ADR 0002 — Device identity and the masked-MAC router

- **Status:** Accepted
- **Date:** 2026-10-28 (Day 2)
- **Resolves:** ADR 0001 §"Discovery strategy" — the open question of how the router's device list is obtained, and how a device is identified once it has been seen

## Context

ADR 0001 left one question open and on the critical path: the pilot network's router exposes its DHCP lease table to the administrator, via SNMP, a status page, or a file export? The answer decides whether the inventory is nearly complete or quietly missing devices.

The answer on a **Starlink router** is: **none of those three.** The router runs no SNMP agent, and its admin UI offers no supported export. What it does expose is a local gRPC control plane:

| Endpoint | Transport | Use |
|---|---|---|
| `SpaceX.API.Device.Device/Handle`, field `3002` (`wifi_get_clients`) | h2c plaintext, port 9000 | The client roster |
| Same service | gRPC-web, port 9001 | Same roster, over HTTP |
| Same service | TLS, port 9002 | Same roster, over TLS |

The roster is the DHCP lease table in substance — it carries every attached device with its address, its lease state, and per-client traffic counters. So the DHCP lease table *is* obtainable, just not through the mechanisms ADR 0001 guessed.

**Then the second discovery broke the plan.** The Starlink firmware **masks the MAC address** it reports: the low three octets are blanked, leaving only the vendor OUI. Three Govee bulbs on the same network arrive as three roster entries wearing one address, `7C:A6:B6:00:00:00`.

That is fatal for the obvious design. The roadmap's "initial IP/MAC address mapping logic" and a MAC-keyed inventory would fold three physical devices into one row — or, worse, split them arbitrarily as their addresses change. The MAC cannot be the primary key here, and pretending otherwise produces an inventory that is wrong in a way nobody can see.

## Decision

**Identity is a key with a basis, not a bare MAC.** Every row carries an `identity_key` of the form `<basis>:<value>`:

| Basis | Key | Strength | Where it comes from |
|---|---|---|---|
| `mac` | `mac:AA:BB:CC:11:22:33` | Strongest | A true hardware address, from the neighbour cache |
| `cid` | `cid:21` | Middle | The router's own per-client identifier |
| `ip` | `ip:192.168.1.21` | Weakest | An address, when nothing else is known |

The rules that follow from the ranking:

- **A row is re-anchored upwards, never downwards.** A device first seen through the router (`cid:21`) and later seen in the neighbour cache becomes `mac:AA:BB:CC:11:22:33` — the *same row*, updated, not a second one. The old basis is never restored, because a device that has shown a real hardware address will show it again.
- **A stronger key supersedes a weaker one at the same address.** When both exist, the weakly anchored row is folded into the strong one, carrying the administrator's `isKnown` decision and the earlier `firstSeenAt` with it, and is then deleted.
- **The router's `client_id` is the only per-device identifier that survives masking**, so `cid:` is the anchor of last resort for a router-reported device. It is stable across address changes and unique per client, which an IP address is not.

### Joining the two views of one device

Discovery runs several sources at once, and the same device is usually visible in more than one. The merge rules, in the order they are tried:

1. **Same trusted MAC.** The neighbour cache is authoritative for hardware addresses.
2. **Same IP address.** The router is authoritative for the *current* address; the neighbour cache may still hold a stale one from before the device renewed its lease.
3. **Same vendor OUI, when unambiguous.** A masked router address and a real address of the same vendor are joined only if the vendor prefix can tell them apart — one masked entry plus one real entry of one OUI. Two real devices of one vendor are never joined on the prefix alone, because a household full of Govee bulbs would collapse into a single device.

Vendor and hostname resolution is applied at ingest time to whatever the merge produced: the OUI registry gives the vendor, and the hostname comes from the name the device asked for, else `vendor-slug` plus a short discriminator drawn from the address or the router client id.

### The design accommodates all three discovery mechanisms

ADR 0001 named three mechanisms. They are not alternatives — they are one pipeline with three inputs, because each has a blind spot the others cover:

| Source | Sees | Blind spot |
|---|---|---|
| Neighbour cache (`arp -a`, `ip neigh`) | True hardware addresses | Only devices this machine has spoken to |
| Router roster (gRPC `wifi_get_clients`) | Every attached device, lease state, traffic counters | Masks MACs to the OUI |
| OUI enrichment | Vendor for any address | Says nothing about which devices exist |

Discovery sources implement one interface (`DiscoverySource`), so the sources can be enabled per deployment with `DISCOVERY_SOURCES=neighbour-cache,starlink-router`. A source that fails is logged and skipped; the poll continues. The simulator (`simulated`) stands in for a router in development and tests, and is refused on a live network.

## Consequences

**Good:**

- The inventory survives the masking router. Three Govee bulbs are three rows, distinguished by their router client ids, and they remain three rows when their addresses change.
- One device seen through both sources is one row, so the poll can run every few seconds without growing the table — the roadmap's "without duplication" criterion holds.
- **A device seen with only an address is still a device.** It is recorded under an `ip:` key with a null hardware address rather than dropped, so the inventory does not quietly under-report — the failure mode ADR 0001 flagged.
- Adding a source later is an interface implementation, not a schema change.
- The identity basis is stored, so the database says *why* a row is keyed the way it is, and a future migration to a stronger basis is auditable rather than guesswork.

**Accepted costs:**

- **A router-only device is identified by an opaque number.** `cid:21` means nothing to a human. Until the neighbour cache has seen the device, the dashboard must show it by its reported name or its address; there is no third option, because the router withholds the rest of the address.
- **Vendor resolution is only as precise as the OUI.** A masked address resolves to the vendor and nothing more — which is exactly why the vendor prefix cannot be used to merge two real devices.
- **A device that has never been seen by the host OS stays weakly anchored.** It is in the inventory with a `cid:` key and no hardware address, and it is re-anchored the moment the neighbour cache sees it.
- **The router's local gRPC is an undocumented interface.** The wire schema is transcribed from the router's own descriptor set and pinned by tests, but a firmware update could change it. The client fails loudly on an unexpected response rather than writing a wrong inventory.

## What this ADR does not decide

- Whether the router roster or the neighbour cache is preferred as the primary source in a given deployment. The merge handles either; only the poll order and the merge's trust rules would change.
- The persistence of traffic counters, which arrive with the roster but are a separate table.
- How a device that changes its OUI by MAC randomization is handled beyond being re-anchored to its new address.
