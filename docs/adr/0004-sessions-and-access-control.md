# ADR 0004 — Sessions, roles, and who may change what

- **Status:** Accepted
- **Date:** 2026-11-04 (Day 4)
- **Resolves:** Roadmap Day 4 activity — "implement basic role-based access control (RBAC)"

## Context

The dashboard shows a device inventory and the traffic those devices moved.
That inventory is the most sensitive thing the product holds: it names the
machines on someone else's network, with their addresses, and it says which
of them is the heaviest user of the link.

Until Day 4 the API served all of that to any client that asked. The
frontend spec had promised a sign-in screen, and the API contract had
defined `POST /api/auth/login` with a `role` on the user — but there was
nothing behind either. The roadmap asks for RBAC on Day 4, and the
frontend spec asks for the administrator to acknowledge that they are using
the tool on a network they are authorised to use. Those are two different
promises and both have to be kept.

Four questions had to be answered together, because each one constrains the
others:

1. **Where do accounts live?** The analyser is a single process on the
   administrator's own laptop, running one pilot, with one operator.
2. **What is a session?** It has to survive a phone being locked and
   reopened, and it has to end by itself when it should.
3. **Who may change what?** Some things are readings and some are decisions.
4. **Where is the gate enforced?** In the browser, on the server, or both?

Two constraints from earlier days make the answer tighter than it would
otherwise be.

**The dashboard runs on the phone.** The phone reaches the analyser across
the LAN, at an address that changes when the DHCP lease renews. So the
client is a different origin from the API, and anything the browser sends
automatically is subject to cross-site rules.

**The analyser can be reachable by the whole network.** ADR 0001 put it on
the administrator's own machine so that the Starlink link never carries the
product's traffic. The API binds to loopback by default, and is bound to
the LAN address deliberately when the administrator wants the phone to
reach it — at which point every other device on that network can reach
the API too. The analyser says so on startup when it is exposed this way.
That makes "the network is trusted" an unsafe assumption and puts real
weight on the sign-in.

## Decision

### Accounts live in the analyser's configuration

There is no users table. The administrator account — and optionally one
read-only viewer — are described by environment variables
(`ANALYSER_ADMIN_EMAIL`, `ANALYSER_ADMIN_PASSWORD`, and the matching
`ANALYSER_VIEWER_EMAIL` and `ANALYSER_VIEWER_PASSWORD` pairs), read by the
same config loader that already holds the database URL.

A table of hashed passwords would be the textbook answer, and for a product
with many users it would be the right one. Here it would be more machinery
than the job needs: one administrator, one machine, one environment file,
and a seven-day pilot. The environment file is already the place the
analyser's identity lives, so the credentials live beside it rather than in
a second store that would need its own migrations, its own seeding step
and its own recovery story.

The viewer account is optional and absent by default. A read-only account
for somebody who may look but not touch is the whole of the multi-user
requirement for the pilot; there is no third role.

### A session is a signed statement, not a record

A session is a bearer token: `v1.<payload>.<hmac>`, where the payload
carries the user id, the role, the issued-at time and the expiry, and the
signature is an HMAC over the payload with a secret the analyser holds.

**The analyser keeps no session table.** Verifying a token is checking a
signature and comparing an expiry against the clock. That means a restart
does not invalidate anyone's session, there is no store to grow, and there
is no cleanup job. It also means a token cannot be revoked before it
expires — which is an accepted limit for a seven-day pilot on a trusted
local network, and the reason the token's lifetime is a configuration
decision (`ANALYSER_SESSION_TTL_HOURS`) rather than a hard-coded week.

The token is **signed, not encrypted**. Anybody holding it can read the role
and the expiry. That is deliberate: the contents are not secret, and
signing them is what lets the analyser hold no session state at all. What
must stay secret is the token itself.

**The signing secret is random when it is not configured.** An analyser
started without `ANALYSER_SESSION_SECRET` gets a random one at boot, and
every session it issues dies with the process. That is the safe direction
to fail: a session that cannot outlive the analyser is one fewer thing to
reason about. A configured secret is stable across restarts, which is what
an administrator actually wants — a phone in a pocket keeps its session
across a reboot of the laptop.

**The password comparison is constant-time, and a missing account still
hashes.** A wrong password and an unknown address take the same time and
produce the same reply, so the sign-in endpoint cannot be used to find out
which addresses have accounts.

### The server refuses, the browser merely agrees

**On the server**, an `onRequest` hook authenticates every request that
reaches a route. A request without a valid bearer token is refused with
`401` and the standard error envelope.

The hook is registered once, on the whole application, and it protects
routes **by default**: a new endpoint is protected the day it is written,
not the day someone remembers to protect it. A route opts out by declaring
`config: { public: true }`, and three do — the sign-in endpoint, the
liveness probe, and the identity endpoint that tells the sign-in screen
which machine it is talking to. Without the first there would be no way to
get a token; without the other two the sign-in screen could not show an
analyser is even there.

**The identity endpoint is public, and that is a trade rather than an
oversight.** It answers without a token, so anybody who can reach the port
can ask it questions. What it reveals is deliberately thin: the hostname,
the Node version and platform, the bind host and port, the uptime, and
whether the API is bound to the loopback interface only. It says nothing
about the devices on the network, which is what the session guards. It
does let an unauthenticated caller fingerprint the machine and confirm the
service is there, and it is reachable by every device on the network for
the same reason the rest of the API is. It is public because the sign-in
screen needs it.

The hook runs before any handler and before the request body is parsed. An
unauthenticated caller therefore cannot make the analyser do any work at
all, not even validate a body. A request for a path no route claims is
let through to the 404 handler, because "no such endpoint" is a more useful
answer than "sign in first" and would send the caller looking for the
wrong problem. That 404 is Fastify's own default body rather than the
`{ error: { code, message } }` envelope the other errors use, so a client
parsing errors has to tolerate both shapes.

**On the server too**, the endpoints that change something — marking a
device as known, acknowledging an alert, editing an alert rule — require
`role: "admin"` and answer `403` otherwise.

**In the browser**, the same rule is expressed as `canWrite`, and the
write controls are simply not rendered for a viewer: the "Mark known"
button on a device becomes a read-only badge, and "Acknowledge" on an alert
becomes an "Unacknowledged" badge.

The browser gate is **not** the security boundary and is not treated as
one. It exists so that a viewer is not offered a button that would fail —
a button that cannot work is a worse interface than no button. The
security boundary is the server, which does not consult the browser at
all. Hiding a control and refusing the request are two separate
mechanisms that happen to agree.

### The token lives in `localStorage`, and the client never decides it is still valid

The token is kept in two places: in `localStorage`, so that a phone which
reloads the page does not have to be signed in again; and in memory, so
that a request made before the first render already carries it.

A cookie would have been the stronger choice, and it is worth saying why it
was not used. The dashboard and the API are different origins — the phone
reaches the analyser across the LAN — so a cookie would need
`SameSite=None; Secure`, and `Secure` means HTTPS, which the plain-HTTP
LAN deployment does not have. A network credential should not be shipped
with the attributes a cross-site cookie needs.

**What `localStorage` costs, stated plainly.** A token in `localStorage`
is readable by any script that runs on that origin. The same-origin policy
keeps other *sites* out; it does not keep other *scripts on this site* out.
The dashboard loads no third-party script, so the practical exposure today
is narrow, but it is not zero: a script injected into the page, a
compromised dependency, or a browser extension with page access can read
the token, and anything it reads is a valid bearer token until it expires.
The token is also written to disk in a form that survives closing the tab
and the browser, which a cookie with `HttpOnly` would not be. This is an
accepted limit for a seven-day pilot on a network the administrator
trusts, not a claim that the storage is safe in general.

**Expiry is the analyser's business.** The client never compares the
stored expiry against the clock. A session found in storage is not trusted
until the analyser has accepted it — `GET /api/auth/session` returns the
current identity and a renewed token, and only then does the dashboard show
anything. A token that expired while the phone was in a pocket otherwise
leaves the dashboard displaying figures it can no longer refresh.

**Renewal extends a live session; it does not resurrect a dead one.** The
analyser refuses a token whose expiry has passed, so an expired session
comes back as `401` and the administrator signs in again. The renewal is
what keeps an *active* dashboard alive — a phone left on the desk, polled
every fifteen seconds, would otherwise be signed out every twelve hours
while somebody was using it.

**An expired token cannot be renewed, because it cannot reach the
endpoint that would renew it.** The renewal happens inside
`GET /api/auth/session`, and that route is behind the same guard as
everything else: the analyser checks the token's expiry before the handler
runs, so a token that has already expired is refused with `401` and no new
token is issued. There is no path from an expired token to a live one.
The user signs in again with the password. This is worth being explicit
about, because the renewal endpoint reads like a way back in and is not
one — a client that tries to renew an expired session gets the same
refusal it would get for no session at all.

**A rejected token ends the session wherever it is noticed.** The API
client ends the session on any `401` — except the sign-in call itself,
which is expected to fail with "not authorised" without the session having
expired. The dashboard then returns to the sign-in screen and says why,
rather than leaving a screen full of stale figures.

### Signing out clears this browser, and nothing else

**Sign-out is local.** It removes the token from `localStorage` and from
memory, and tells the dashboard to show the sign-in screen. It sends no
request, because there is no endpoint to send it to: the analyser keeps no
session table, so there is nothing for it to delete. The token that was
in that browser is still signed, still valid, and still accepted by the
API until its expiry passes.

**So sign-out is not revocation.** A token somebody copied out of
`localStorage` — out of the browser's developer tools, out of a backup, out
of a shared machine — stays good until it expires. The only ways to stop a
token early are to change the signing secret, which invalidates every
session at once, or to wait out the expiry. For a seven-day pilot on a
network the administrator trusts, this is an accepted limit rather than an
oversight, but it should be described as a limit rather than as a
"sign-out".

### On the LAN, the password and the token travel in clear

The pilot serves plain HTTP. There is no TLS on the link between the phone
and the analyser, so:

- The password is sent in the body of `POST /api/auth/login`, readable by
  anything that can observe the traffic.
- The token is sent in the `Authorization` header of every later request,
  readable in the same way.
- The sign-in screen itself is fetched over plain HTTP, so the page could
  be altered in transit.

**The traffic is visible to anything on the path** — the router, another
host on the same wireless network, anything with a promiscuous interface
on the wired segment. On a home network that usually means the other
devices, which are the same devices that can reach the API anyway.

This does not make the sign-in pointless, but it does change what the
sign-in is for. An observer watching the traffic sees the analyser’s
address in the packet, so a captured token is directly reusable, and a
captured password can be replayed. The sign-in still stops a device on the
network from *asking* for the inventory without a credential — it is the
boundary between the network and the device list. It is not a defence
against a device on the network that is also watching the traffic. The two
are different jobs, and only the first is done.

The honest summary is that the deployment needs a network the administrator
trusts, and that HTTPS on the LAN would close this gap and is the first
thing to add after the pilot. A password hashing scheme that is robust
against an offline attacker does not help here, because the password is
held in plain text in the environment file and compared directly — there
is no hash at rest to attack offline. The exposure is in transit.

### The sign-in comes before the privacy notice

The interface gates in this order: **sign-in, then the authorised-use
acknowledgment, then the dashboard.** The order is not arbitrary. The
privacy notice asks the operator to confirm they are using the tool on a
network they are authorised to use, and it is worth reading before any
device is named — but there is nothing to protect until someone has signed
in, and showing a notice to an anonymous visitor would imply the
dashboard had already shown them something. So the sign-in comes first,
and the notice is behind it, still ahead of the inventory.

## Consequences

- The device inventory and the traffic figures are behind a sign-in, and a
  request without a token does no work on the analyser at all.
- The analyser holds no session state. Restarting it does not sign anyone
  out, unless it was started without a signing secret.
- A token cannot be revoked before it expires. On a seven-day pilot on a
  trusted network that is acceptable; it is not acceptable for a product
  with accounts that outlive their password.
- **Signing out is not revocation.** It clears the token from this browser
  and nothing more; a token somebody copied out of `localStorage` stays
  good until it expires. The same limit as above, seen from the other side.
- **An expired session cannot be renewed.** `GET /api/auth/session` will
  extend a session that is still live, but it is behind the same guard as
  every other route, so an expired token is refused before the handler
  runs. There is no way back from an expired session except the password.
- **On the LAN deployment the password and the token travel in clear.** The
  pilot serves plain HTTP, so anything that can observe the traffic on the
  path can read both. The sign-in protects the *inventory* from the
  network; it does not protect the credentials from the network. HTTPS on
  the LAN would close this and is the first thing to add after the pilot.
- The device inventory is behind a sign-in, but the analyser's own identity
  is not: `GET /api/system/info` is public and reveals the hostname, the
  runtime, the bind address and the uptime. An unauthenticated caller can
  fingerprint the machine even though it cannot see a single device on the
  network.
- There is one administrator and at most one viewer. Adding a third
  account, or an account that is not in the environment file, means a
  users table and a different set of decisions.
- The browser's `canWrite` gate and the server's `requireAdmin` are two
  implementations of one rule. The server's half is covered by the
  backend tests, which assert that a viewer is refused `403` on all three
  write endpoints and is allowed to read the same resources. The browser's
  half is not covered by a test today — the frontend tests all run as an
  administrator — so the two halves are not yet verified to stay in step.
  Adding a viewer-role frontend test would close that gap.
- The analyser's address is editable from the sign-in screen as well as
  from settings, because the settings screen is behind the sign-in and a
  phone pointed at the wrong machine would otherwise have no way out.
- When the API is bound to the LAN address, it is reachable by every device
  on the network. The sign-in is what stands between that reachability and
  the inventory.

## Alternatives considered

**TLS on the LAN.** Would close the gap where the password and the token
travel in clear, and would let the session ride in a `Secure` cookie.
Rejected for the pilot only: it needs a certificate on the laptop and a
trust decision on the phone, which is more setup than a seven-day pilot
earns. It is the right answer for a real deployment and it is the first
thing to add after this one.

**A users table with hashed passwords.** The right answer for a product
with more than one operator over time. Rejected here because the analyser
runs one pilot for one administrator, and a second store would need
migrations, seeding and a recovery path for a problem the pilot does not
have.

**Server-side sessions in a table or in Redis.** Revocable, and opaque to
the client. Rejected because it adds a store whose loss logs everybody out
and whose growth needs managing, in exchange for a revocation capability
the pilot does not need. It also puts a session store on the machine whose
whole purpose is to add as little as possible to the host network.

**A cookie-based session.** Stronger against cross-site script access, and
the default for a browser app. Rejected because the cross-origin LAN
deployment forces `SameSite=None` and `Secure`, and `Secure` needs HTTPS
that the plain-HTTP deployment does not have.

**A self-contained token the client checks against its own clock.** No
round trip on load. Rejected because the client cannot know whether the
analyser's secret has changed or whether the analyser has been restarted
without a stable secret, so it would eventually show a dashboard the
analyser will not answer.

**Gating only in the frontend.** One place to change, and the role is
already in the client. Rejected outright: the API is reachable by every
device on the network, so a browser-only gate is no gate at all.

**Checking the token in the handler rather than in a hook.** A hook covers
routes that are added later without anyone remembering it. The hook also
runs before the body is parsed, so an unauthenticated caller cannot make
the analyser validate anything.
