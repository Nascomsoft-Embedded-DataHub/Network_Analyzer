# ADR 0003 — What the telemetry measures

- **Status:** accepted
- **Date:** 2026-11-01
- **Day:** 3 — Telemetry & Health Tracking

## Context

Two dashboards are coming: per-device consumption over the last seven days,
and a health widget that says whether the network is working. Both need
numbers, and the numbers have to mean something.

The router is the only source that sees the whole network, and it reports
two very different kinds of figure:

- **Traffic counters.** For each client, the bytes it has moved *since it
  attached*. A cumulative counter, not a rate.
- **Link measurements.** The result of the router's own speed test and its
  own ping metrics.

These need different treatment. A cumulative counter becomes consumption
only when it is compared with the reading before it, and the difference
depends entirely on when the two readings were taken. A link measurement is
a measurement of the link, but of what kind — and the dashboard is very
easily misled here.

The privacy directives constrain the result as well. Only the telemetry
needed to render the seven-day dashboards may be stored; granular flow data
is dropped after 24 hours and usage rollups are retained for seven days.

## Decision

### Consumption is the difference between two readings

The collector keeps a baseline per device — the counters as last written to
the database — and writes the difference between the baseline and the next
reading into an hourly bucket. The baseline lives on the device row
(`devices.last_rx_bytes`, `devices.last_tx_bytes`,
`devices.last_counters_at`), not in memory, so a restart does not turn the
counters into a "first reading" and lose the difference between them.

Three cases follow from that, and each of them has a wrong-looking
alternative that a straightforward implementation falls into:

- **The first reading of a device is a baseline, not consumption.** It counts
  traffic from an unknown start — possibly since the router booted — and
  that traffic belongs to no particular hour. Counting it would put a spike
  into whichever bucket happened to be open.
- **A counter that goes backwards is not an error.** The device reattached
  and the router started counting again; the whole of the new reading is
  traffic moved since that reattachment, and it is counted in the hour the
  reattachment was noticed.
- **The router's received counter is the client's download.** The router
  counts what it received from the client and what it sent to the client.
  `rx_bytes` is therefore the client's download and `tx_bytes` its upload.

The buckets and the new baseline are written in **one transaction**. That is
what makes the collector safe to interrupt: either both happen or neither
does, so a crash can neither double-count traffic nor lose it.

### An outage is a hole in the record, not a hole in the totals

After a restart, the difference between the persisted baseline and the next
reading covers traffic the analyser never saw happen. It is still real
traffic, so it is counted. The record says only that it happened between
two moments, so it is **spread evenly across the hours in between** rather
than dumped onto one of them, which would show a spike that never happened.
The baseline's timestamp is what makes that possible, which is why the
device row carries `last_counters_at` alongside the counters.

This is an approximation and is documented as one. The totals are exact; the
placement within an outage is a judgement, not a measurement.

### Health figures are capacity, not load

`downloadMbps` and `uploadMbps` describe **what the link can carry**, not
what it is carrying. A network carrying nothing is perfectly healthy, and a
dashboard that reported it as having no bandwidth would be wrong. The
figure comes from the router's own speed test, which is the only honest
capacity measurement available without sending traffic to a third party.

`latencyMs` comes from the router's ping metrics, which are steadier than
the latency the speed test reports in passing.

### A reading is written whole or not at all

The health columns hold numbers, and a number that was not measured has no
honest value: zero would read as "the link is down". A reading missing any
of its figures is therefore **dropped**, and the gap it leaves in the
series is the honest record of a measurement that could not be taken.

### Uptime is the analyser's own streak

`uptimeSeconds` is the length of the current unbroken run of successful
probes. It starts at the first successful probe and resets to zero whenever
a probe fails. It is deliberately *not* the router's own uptime counter,
which answers a different question — how long the router has been running,
not how long the link has been reachable from here.

### The bands live in the shared contract

The API's snapshot endpoint and the dashboard both classify a reading, and
they disagreed: the backend used 150 ms where the frontend used 200 ms for
the `degraded` band. The bands now live in `@network-analyser/contracts`
(`healthStatus`) and both sides import them, so they cannot drift apart
again. See `docs/api-contracts.md` for the thresholds.

### Retention

Nothing finer than the hour is ever written. There is no per-flow table, no
per-minute table, and nothing that could hold a destination, a payload, or a
timestamp precise enough to follow a device around. The hourly rollups are
kept for seven days — the window the dashboards cover, and the longest the
privacy directives allow — and the retention sweep removes them after that.

## Consequences

- The dashboards can show seven days of per-device consumption and a health
  history that is honest about what it does not know.
- A device that is not attached is absent from the roster, and the traffic
  it moved before the analyser started is not in the record. The analyser
  measures the traffic it can see.
- The hourly placement of traffic that moved during an outage is
  approximate. The totals are not.
- The health page can show gaps. That is the price of never writing a zero
  that means "not measured".
- The speed test is real traffic on the link. It is taken every five minutes
  by default, which is a configuration decision rather than a fixed one.

## Alternatives considered

**Store the counters and compute consumption at query time.** It would make
the collector trivial, but it would keep raw per-device counters around for
longer than the privacy directives allow, and the query would have to
difference them anyway.

**Send traffic to a third-party speed test.** It would give a comparison
against a real-world figure rather than the router's own opinion, and it
would send the analyser's traffic to a service outside the network. The
router's own measurement is the one that describes the link being managed.

**Count the health series as "degraded" when the speed test is refused.**
A zero would be a lie, and a `null` would need the contract to change.
Dropping the reading keeps the series honest at the cost of a gap.

**Throttle the speed test when the link is busy.** It would reduce the
measurement's own cost, but it would also make the capacity figure a
function of the load rather than of the link.
