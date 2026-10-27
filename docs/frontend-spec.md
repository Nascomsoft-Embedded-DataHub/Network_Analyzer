# Frontend Specification — Day 1

**Audience:** Frontend track (Glory). Companion to [`api-contracts.md`](api-contracts.md), which defines the data shapes. This document defines the *device and layout* requirements.

## The device model

The administrator uses **two devices**, and both are admin devices:

| Device | Role | Notes |
|---|---|---|
| Laptop | Runs the analyser; also hosts the dashboard | The API is reachable at `http://127.0.0.1:3000` |
| Android phone | Dashboard client only | Reaches the API at `http://<laptop-LAN-IP>:3000` |

The analyser never runs on the phone. The phone is a client, exactly like the laptop's browser — same web app, same API, same contracts.

**Consequence for your build:** this is a **responsive, mobile-first web app**, not a desktop dashboard that happens to shrink. The phone is a first-class target, not an afterthought.

## Requirements

### Layout

- **Mobile-first.** Build the narrow layout first, then extend. The phone is the harder constraint.
- The device list, the peak-usage chart, the alerts panel, and the health status must all be usable at **360 px wide** (a common Android width) without horizontal scrolling.
- Tables are the main risk on narrow screens. Collapse the device table to a stacked card list below the phone breakpoint, and keep the charts full-width.
- Charts must be legible on a phone: axis labels every other tick at most, no legends that collide, and touch targets at least 44 × 44 px.
- Support both light and dark system preference — an administrator checking usage at night on a phone should not be flashbanged.

### Installable on Android

Ship a **PWA**: web app manifest plus a service worker, so the administrator can add it to their home screen and launch it like a normal app. Without this, the phone experience is a browser tab that gets discarded.

The service worker must not cache API responses — the data is live and the app already has a 24-hour data-minimisation posture. Cache the app shell only.

### Connecting to the analyser

The API base URL **is not fixed** — it depends on the machine the analyser runs on, and the laptop's LAN IP changes when the DHCP lease renews. The dashboard must therefore let the administrator set or confirm the API base URL, and persist it locally.

- Default to `http://localhost:3000` (works on the laptop).
- On the phone, the admin enters the laptop's LAN address once.
- Persist the choice in `localStorage` so it survives a browser restart.
- `GET /api/system/info` confirms it is talking to the right analyser: it returns the analyser's `hostname`, `version`, `bindHost` and `bindPort`. Show this in a diagnostics panel so the admin can confirm at a glance which machine is being observed.

### Connection states

The phone can lose the LAN — the administrator walks out of Wi-Fi range, or the laptop sleeps. Handle these explicitly rather than showing a blank screen:

| State | What to show |
|---|---|
| Connecting | Skeleton loaders for the panels, not a spinner over stale data |
| Loaded | The dashboard |
| Analyser unreachable | A clear message naming the analyser and its address, with a retry action. Do **not** show zeros — an unreachable analyser and an idle network look identical, and a zero-usage dashboard is a false reading. |
| Partial data | A panel that failed to load should say so, rather than rendering as empty |

### Privacy notice

The roadmap's notice requirement is a **UI surface, not a legal footnote**: the pilot UI must include a prominent administrator acknowledgment that the tool is being used on an authorized, owned network.

- Show it as a blocking acknowledgement on first launch, and make it visible from a settings entry afterwards.
- It must be prominent on the phone too — that is the device most likely to be used away from the desk.
- It must be shown *before* any device inventory is displayed.

## Available data

Everything in [`api-contracts.md`](api-contracts.md) is available from Day 1, with mock fixtures in `packages/contracts/src/mock.ts` for every response shape, including the new `GET /api/system/info`. Build against those fixtures; the shapes will not change on Day 5.

## Not in scope for the MVP

- Remote access from outside the local network. The phone works when it is on the same network as the analyser.
- Push notifications. Alerts are polled in-app.
- Offline data. There is no offline mode — the analyser is the source of truth.
