# ADR 0006 — Alert triggers and consumption reports

- **Status:** Accepted
- **Date:** 2026-11-06
- **Day:** 5 — Alerts & Export Reporting
- **Resolves:** Roadmap Day 5 activity — "Configure logic triggers for unknown-device detection and high-usage thresholds. Build the report generation engine to export daily and weekly consumption into manager-friendly CSV/PDF formats."

## Context

Two things were promised for Day 5, and neither existed.

**Nothing raised an alert.** The `alerts` table, the `alert_rules` table, the
rules seeded by the migration, the endpoints that list and acknowledge
alerts, and the contract that describes them were all in place. The one
thing that was missing was the thing that writes the rows: a rule said "a
device that used more than five gigabytes in a day is a `critical` alert",
and no part of the analyser ever compared a device's traffic against it. The
dashboard could show a list of alerts, and the list was always empty.

**There was no report.** The dashboard shows the network live, which is the
right thing for a chart and the wrong thing for a manager who wants to know
what last Tuesday cost. The roadmap asks for daily and weekly consumption
"in manager-friendly CSV/PDF formats"; the team split guide assigns the
backend track "report generation logic (CSV data exports)".

Three constraints from earlier days shape both answers.

**The measurement is already fixed.** ADR 0003 settled what the telemetry
measures: cumulative counters read from the router, differenced into
hourly buckets, with the baseline kept on the device row so that an outage
leaves a hole in the record rather than in the totals. A trigger and a
report that read anything else would be measuring something the dashboard
does not show, and there would be two answers to the question "how much did
this device use?".

**The retention window is seven days.** The hourly rollups are pruned after
`TELEMETRY_USAGE_RETENTION_DAYS`, which is seven by default, and the
privacy directives allow exactly that long. A report can only ever cover
what is still on record.

**A viewer may read every figure.** ADR 0004 made the three endpoints that
*change* something administrator-only and left everything else to any
signed-in session. A report and an alert are both readings, so neither
raises the bar.

## Decision

### The trigger engine is a background job

Alerts must fire when nobody is looking at the dashboard, so the engine is
a timer rather than something a request triggers. It follows the pattern the
other background jobs already use — `RetentionSweeper`, `BandwidthCollector`
— with a `start(intervalMs)`, a `stop()`, and a private method that catches
its own errors so a failed pass cannot take the process down.

The engine reads the enabled rules from `alert_rules` and evaluates each one.
**A rule that is disabled is not evaluated at all**, and the severity of an
alert is the severity of the rule that raised it, so the rule decides both
*whether* something is said and *how loudly*.

The first pass runs the moment the engine starts, not a full interval later.
A device that appeared while the analyser was down should not have to wait a
minute to be reported, and the cost of the first pass is one query.

The interval is configuration (`ALERT_TRIGGER_INTERVAL_SECONDS`, a minute by
default). A minute is often enough: the usage counters are handed over
every few minutes anyway, so a faster pass would look at almost the same
numbers.

### `unknown_device` fires once per device

A device stays `isKnown = false` until an administrator marks it, which
means the engine will see the same unknown device on every pass for as long
as it takes somebody to look at it. Firing on every pass would fill the
alert table with one row per device per minute, and an alert list that
nobody reads is the same as no alert list.

So the rule is: **an unknown device is reported once.** The engine looks
for an existing `unknown_device` alert for that device before writing a new
one, and the existence of that alert *is* the record that the administrator
has been told.

This has a consequence worth stating rather than hiding: **marking a device
as unknown again does not report it again.** The device was seen, the
administrator was told, and a second alert would say nothing new. The
alternative — treating a device as unknown-again as a new event — would need
a record of *when* it became unknown, which the device row does not keep.

### `high_usage` fires once per device per UTC day, on the consumption so far today

The threshold on a `high_usage` rule is a **daily allowance** — the contract
says so, and the seeded default is five gibibytes a day. The engine
compares the device's consumption *so far today* against that allowance.

Comparing "so far today" rather than yesterday's total at midnight is what
makes this an alert rather than a report. An allowance crossed at ten in the
morning is news at ten in the morning; the same figure read at midnight is
yesterday's news, and yesterday's news belongs in the report.

The measurement is the sum of the hourly usage buckets that fall on the
current UTC day — the same rollups the dashboard's daily view reads, with no
new table and nothing finer than the hour. Two things follow from that, and
both are limits rather than choices:

- **The last few minutes are missing.** The collector hands the traffic over
  on its own interval, so the figure is "so far today" up to the last
  handover rather than up to the second.
- **A day the analyser was not running produces no alert.** The engine
  compares today against the allowance, so an allowance crossed on a day the
  analyser was off is never reported. The traffic itself is still on record
  and still appears in the report.

Deduplication is by the alert's own timestamp: at most one `high_usage`
alert per device per UTC day. The next day's allowance starts fresh, and the
day boundary is UTC because everything else in the analyser is.

**A rule with no threshold cannot fire.** The contract already says a rule
with a null threshold is one that cannot fire, and the engine honours it
rather than treating a null as zero — a rule that quietly fires on every
device would be worse than one that stays silent.

### An alert names the device by hostname and nothing else

The contract's privacy note says alert messages reference devices by id and
hostname only, and the engine keeps to it: no address, no hardware address,
no traffic detail. A message is a sentence somebody reads aloud, and it
carries the hostname because that is the name a person uses.

The byte figures live in `thresholdBytes` and `observedBytes`, which are
numbers, and the message carries the same two figures written the way a
person reads them — "kitchen-tablet used 5.42 GiB today, above the 5.00 GiB
daily allowance".

### The engine gets an index it needs

The engine asks "has this device already been reported?" on every pass, for
both kinds of rule. The `alerts` table had no index on `device_id`, so that
question was a scan of the whole table. The migration adds
`alerts(device_id, type)`, which is the pair the engine searches by.

### The report is a CSV download

The consumer of a report is a person who wants to send a spreadsheet to
somebody else, so `GET /api/reports/consumption` answers with a CSV file
rather than a JSON envelope.

**It is deliberately not in the `ApiRoutes` registry.** The registry
describes JSON request and response shapes, and the dashboard's mock router
has to answer for every route in it — that is what the frontend's
mock-coverage test asserts. A file download has no JSON shape to mock, and
adding the route to the registry would have required a change to the
frontend track's mock router, which is the other track's file. The *query*
shape is still a shared contract (`ReportQuerySchema`), so both sides agree
on the window and the granularity; only the response is outside the
registry.

**The report reads exactly what the dashboard reads.** The same hourly
rollups, nothing finer. A report can therefore never reveal more than the
dashboard already shows, which keeps the privacy argument in ADR 0003 intact
without a second argument.

**The buckets are truncated in UTC explicitly** — `date_trunc('day', bucket_start
AT TIME ZONE 'UTC')` rather than letting the database's session time zone
decide. A report whose days changed meaning with the server's time zone
setting could not be compared with the dashboard beside it.

**Each period opens with the network's own line**, then the devices in order
of what they used. A reader looking for the biggest offender finds it
without sorting anything, and a `scope` column (`network` or `device`) says
which is which so that a spreadsheet can pivot on it.

**Each row carries the exact byte counts and the same numbers written for a
human.** Everything else in the system speaks in integers, and a report that
only said "5.42 GiB" would be less precise than the system it reports on.

**A hostname is whatever the device on the network said it was**, so the CSV
writer defends the file against the two things a free-text field from the
network can do to a spreadsheet: a cell that begins with `=`, `+`, `-` or `@`
is prefixed with an apostrophe, because a spreadsheet would otherwise run it
as a formula; and a cell containing a comma, a quote or a newline is quoted,
because an unquoted comma moves every column after it.

**Any session may read a report.** A report holds the same figures the
dashboard already shows and nothing an administrator-only rule would
protect, so it sits with the other readings.

**The default window is the retention window** — everything still on record,
up to now. Asking for "the report" gives the whole of what the analyser
knows rather than an arbitrary week.

### PDF and email are not here

The roadmap asks for "CSV/PDF formats" and for "automated UI/email alerts".
Both halves of that are worth being precise about.

**PDF is not implemented.** The team split guide assigns the backend track
"report generation logic (CSV data exports)", and CSV is the deliverable.
A PDF would need a renderer dependency in the backend and a second output
format that has to be kept in step with the first — a second definition of
what a report is, for a seven-day pilot. It is a reasonable follow-up and
nothing in the design prevents it: the engine produces rows, and the rows
are what a PDF would draw.

**Email is not implemented.** The UI half of "automated UI/email alerts" is
done: an alert is raised without anybody asking, and it is there to be seen
on the dashboard and read through `GET /api/alerts`. The email half is not,
and adding it would mean a transport, a relay to point at, credentials for
it, an outbound connection the analyser does not otherwise make, and a
delivery failure mode — on a product whose whole purpose is to add as little
as possible to the host network. There is also nowhere to send it: the
analyser's accounts live in its environment file (ADR 0004) and carry no
mail address. Alerts are delivered by the dashboard and the API, and that is
what the pilot has.

## Consequences

- Alerts now happen on their own. The alert list is written by the engine,
  not by the dashboard, and it is populated whether or not anybody is
  looking at it.
- **An unknown device is reported once.** Marking it known stops it being
  reported; un-marking it does not report it again.
- **A high-usage alert is at most one per device per day.** The day's
  allowance is judged once, against the traffic so far.
- **A day the analyser was not running produces no alert.** The traffic is
  still on record and still in the report; the alert is not, because the
  engine only ever compares the current day.
- **A weekly report can cover at most one week.** The hourly rollups are
  pruned after seven days, so "this week" is the most a weekly report can
  mean. This is a property of the retention window, not of the report, and
  the report is honest about it: the window it covered is in the filename
  and in the `X-Report-From`/`X-Report-To` headers.
- **A report needs the token in a header**, so the dashboard cannot offer it
  as a plain link or an `<a download>`; it has to fetch it and turn it into
  a blob. That is a frontend decision, and the query contract is published
  for it.
- The report and the dashboard cannot disagree, because they read the same
  rows.
- There is no PDF and no email. Both are stated in the API contract and in
  the roadmap rather than left to be discovered.

## Alternatives considered

**Firing the trigger from the ingestion listener**, when a device is first
written. Rejected: the listener only ever sees devices that appeared while
the analyser was running, so a device already in the table when the engine
started would never be reported. It also has nothing to say about the
high-usage rule, which is about traffic rather than about discovery.

**Raising an alert on every pass and letting the dashboard collapse the
duplicates.** Rejected: the table fills with one row per device per minute,
the deduplication then has to happen in two places, and the count the
dashboard shows stops meaning anything.

**A `lastAlertedAt` column on the device row.** Rejected: it is a second
record of the same fact as the alert, and two records of one fact will
disagree — a device marked known would leave a stale timestamp behind, and a
delete would leave an orphan. The alert table is already the record.

**Treating "marked unknown again" as a new event**, so that un-marking a
device reports it once more. Rejected for now: it needs a record of when
the device became unknown, which the device row does not keep, and it makes
the meaning of an alert depend on a journey through the device's history
rather than on the traffic.

**A JSON report endpoint**, returning the rows in the usual envelope.
Rejected for this endpoint because the person asking for a report wants a
file they can forward. It is the obvious thing to add if the dashboard
wants to render the same report inline — and it would then need a registry
entry and a mock, which is the other track's file.

**A PDF renderer.** A dependency in the backend and a second rendering path.
CSV is what the team split guide asks for, and the report's rows are already
independent of the format that draws them.

**Sending alerts by email.** A transport, a relay, credentials and an
outbound connection, in a product that is meant to be a quiet observer of
the network it runs on — and nowhere to send them, since the analyser's
accounts carry no mail address.
