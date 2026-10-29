# Network Analyser — frontend

The dashboard for the Network Analyser: a responsive, installable web app used from the
administrator's laptop and from an Android phone on the same network.

It is a **Vite + React + TypeScript** workspace — not Next.js. `@network-analyser/contracts`
exports raw TypeScript source, and Vite consumes that natively, so the frontend and the backend
compile against the same schemas in the same commit.

## Running it

From the repository root:

```bash
npm install            # links this workspace
npm run dev            # backend on :3000 and frontend on :5173, side by side
```

Or this workspace on its own:

```bash
npm run dev            # http://localhost:5173
npm run dev --workspace frontend
```

The dev server binds every interface (`server.host: true`), so a phone on the same LAN can reach
it at `http://<laptop-LAN-IP>:5173`. The port is pinned to **5173** with `strictPort`, because the
backend's default CORS origin is `http://localhost:5173` — if Vite silently moved to 5174, the
browser would start rejecting every API call.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the production build on :5173 |
| `npm run typecheck` | `tsc --noEmit` over `src`, `tests` and `vite.config.ts` |
| `npm run test` | Vitest, single run |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | ESLint (flat config) |

Run a single test file with `npx vitest run tests/connection-state.test.tsx`, or a single test by
name with `npx vitest run -t "becomes unreachable"`.

## Mock data, and how Day 5 swaps it for the live API

There is exactly one switch: the `VITE_USE_MOCKS` environment variable, read in
[`src/api/config.ts`](src/api/config.ts).

- **Unset (the default)** — responses come from the contract fixtures in
  `packages/contracts/src/mock.ts`. No analyser has to be running.
- **`VITE_USE_MOCKS=false`** — responses come from the live API at the configured base URL.

```bash
VITE_USE_MOCKS=false npm run dev --workspace frontend
```

Nothing else changes. Components, hooks and providers do not know where their data came from —
the switch lives inside the API client, so Day 5's swap is a flag, not a refactor.

The mock router ([`src/api/mock.ts`](src/api/mock.ts)) answers for **every** route in the
`ApiRoutes` registry, and a test fails if the two ever fall out of step. Fixtures are validated
against their contract schema, so a fixture that drifts fails in the test rather than on screen.

> The contract package has no fixture for `GET /api/system/info`, `GET /api/health/snapshot` or
> `GET /api/auth/session`. Those three are built in
> [`src/api/fixtures.ts`](src/api/fixtures.ts) and validated against the same schemas. Moving them
> into `@network-analyser/contracts` would be cleaner — see the open questions.

## Where the analyser lives

The API base URL is **not fixed**: the analyser runs on the administrator's laptop, whose LAN
address changes when the DHCP lease renews.

- Default: `http://localhost:3000` — right on the laptop.
- On the phone: the laptop's LAN address, e.g. `http://192.168.1.24:3000`.
- Editable in **Settings → Analyser address**, persisted in `localStorage`, with a **Test
  connection** action that asks the analyser to identify itself.

The dashboard polls `GET /api/system/info` every 15 seconds and exposes four connection states:

| State | What the dashboard shows |
|---|---|
| `connecting` | Skeleton loaders — not a spinner over stale data |
| `loaded` | The dashboard |
| `unreachable` | The analyser and its address, plus a retry action. **Never zeros** |
| `partial` | The panels that failed say so, rather than rendering empty |

`Diagnostics` shows the analyser's hostname, version, bind host and port, uptime and runtime, so
the administrator can confirm at a glance which machine is being observed. When `loopbackOnly` is
false, a warning is shown across the app: the analyser is reachable by other devices on the
network, and authentication is not implemented yet.

## Privacy acknowledgment

The roadmap's notice requirement is a **UI surface, not a legal footnote**. On first launch a
blocking acknowledgment appears, and the dashboard does not render at all until it is given. The
acknowledgment is stored in `localStorage` and remains reachable from **Settings → Privacy**.

## Component library

Primitives only — no feature screens. All are mobile-first, carry a 44×44px minimum touch target,
and use the CSS custom properties in [`src/styles/index.css`](src/styles/index.css) so light and
dark come from one definition.

| Component | Purpose |
|---|---|
| `Button` | Primary, secondary, ghost and danger actions; 44px and 48px sizes |
| `IconButton` | Square 44px button; the label is required for the accessible name |
| `Card` | Bordered panel with an optional header and actions slot |
| `Badge` | Small status label — neutral, ok, warn, danger, info, accent |
| `StatusIndicator` | Coloured dot plus label for device and health status |
| `Skeleton` | Loading placeholder block |
| `EmptyState` | "Nothing here yet" panel with an optional action |
| `ErrorState` | Failure panel with an optional retry action |
| `Spinner` | Indeterminate progress indicator |
| `Input` | Labelled text input with hint and error |
| `Select` | Labelled dropdown with hint and error |
| `Toggle` | Labelled switch |
| `Table` | Responsive table — a table from `md` up, a stacked card list below |
| `Modal` | Dialog with backdrop dismissal and Escape handling |
| `Tabs` | Scrollable tab strip |
| `Toast` | Notification, plus the viewport it renders into |

Rules the components follow:

- **Mobile-first.** The narrow layout is the base; the wide layout is the enhancement.
- **44×44px minimum touch target** on every interactive element.
- **No component fetches data.** Data arrives through the providers and the `useAsyncData` hook.
- Light and dark are the same components with different token values.

## Routing map

| Route | Screen | Day 1 state |
|---|---|---|
| `/` | Dashboard | Placeholder — the shell and charts arrive on Days 2–3 |
| `/devices` | Devices | Placeholder |
| `/alerts` | Alerts | Placeholder |
| `/health` | Health | Placeholder |
| `/diagnostics` | Diagnostics | **Working** — shows the analyser identity |
| `/settings` | Settings | **Working** — base URL, test connection, privacy entry |
| `/privacy` | Privacy notice | **Working** — the acknowledgment surface |
| `*` | Not found | Placeholder |

Every placeholder says the panel is not built yet. No invented figures, no fake charts.

## Theming

Tokens are CSS custom properties on `:root`, overridden in a single
`prefers-color-scheme: dark` media query, and mapped into Tailwind utilities through
`@theme inline` in [`src/styles/index.css`](src/styles/index.css). Components reference semantic
tokens (`bg-surface`, `text-ink-muted`, `border-line`) and never raw colours, so the whole app
follows the system preference without a theme toggle.

Styling is Tailwind v4 via `@tailwindcss/vite`. There is no `tailwind.config.js` — the theme
lives in the CSS file.

## PWA

`public/manifest.webmanifest` plus `public/sw.js`. The service worker caches the **app shell
only**; API responses are never cached, because the analyser is the source of truth and the
product keeps a 24-hour data-minimisation posture.

Registration is guarded twice: the worker registers only in a production build, and only in a
secure context (`window.isSecureContext`). The dev build deliberately does not register it — a
worker caching Vite's hot-reloading modules causes confusing failures.

> **Installing over the LAN will not work.** A service worker requires a secure context, so
> `http://<laptop-LAN-IP>:5173` cannot install the app — only `http://localhost` (which counts as
> secure) or an HTTPS origin can. The phone therefore reaches the dev server over plain HTTP but
> cannot install the PWA from it. See the open questions.

## TypeScript

`strict`, plus `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch`
inherited from the root `tsconfig.base.json`. `moduleResolution` is `bundler` so the contracts
package's raw source resolves natively. The `@/` alias points at `src/` in both `tsconfig.json`
and `vite.config.ts`.

## Open decisions

1. **PWA installability over plain HTTP.** The phone can use the app over the LAN, but cannot
   install it from an `http://<LAN-IP>` origin. Options: serve the build over HTTPS on the LAN,
   or accept that installation only works from `localhost` during development and from an HTTPS
   deployment in the pilot. Needs a decision before Day 7's pilot launch.
2. **`POST /api/auth/login` has no backend implementation.** The contract defines it and the
   frontend has a fixture for it, but `backend/src/app.ts` registers no auth routes. Day 4's
   role-based UI will be built against a contract with nothing behind it.
3. **CORS and the laptop's LAN origin.** The phone's browser sends the laptop's LAN origin, so
   `CORS_ORIGIN` must include it — and it changes when the DHCP lease renews, which breaks the
   phone again. The current recommendation is to serve the built SPA from the Fastify service so
   the browser talks to a single same-origin host.
4. **Missing fixtures in the contracts package.** `MOCK_SYSTEM_INFO`, a health snapshot and a
   session fixture would belong in `packages/contracts/src/mock.ts` alongside the others.
5. **Health status bands.** The contract pins only the `healthy` band (latency ≤ 50ms and
   ≥ 10Mbps down). The `degraded` and `down` thresholds used by the mock are a frontend
   approximation until the backend documents the rest.
