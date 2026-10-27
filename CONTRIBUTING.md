# Contributing — GitHub Protocol

This encodes the collaboration rules from the **Team Split Guide** (`docs/network-analyser-team-split-guide.md`). The 7-day sprint only works if both tracks follow them exactly.

## Branching

- **`main` is deployable, working code only.** No direct commits.
- Daily feature branches, named after the developer and day:
  - Backend (Stanley): `stanley/day1-schema`, `stanley/day2-ingestion`, …
  - Frontend (Glory): `glory/day1-ui-shell`, `glory/day2-dashboard-shell`, …
- **Pull from `main` at the start of every day** before writing new code. Merge conflicts are the enemy of speed.

## Commits

- Commit early and often on your feature branch — the branch is your workspace, `main` is the product.
- Write imperative subjects that say what the commit does: `Add devices list endpoint`, `Fix timeline bucket rounding`, not `updates` or `wip`.
- Never commit `.env` or credentials — `.env.example` documents the required variables.

## The 4:00 PM sync

- By **4:00 PM daily, both developers open a Pull Request** for the day's branch.
- Review each other's PRs and **merge into `main` by end of day**.
- A PR with no reviewer comment is not reviewed — leave an approval or a change request.

## API contracts first

- The backend track documents the JSON structure of every endpoint **before building logic** (see `docs/api-contracts.md`).
- The frontend track builds against mock data from `packages/contracts/src/mock.ts`.
- **A contract change is a shared change**: update the Zod schema in `packages/contracts`, and the fixtures and this flow break loudly instead of drifting silently. Agree it in the PR, never discover it on Day 5.

## Integration checkpoints

- If the backend finishes an endpoint early, push the branch — the frontend can integrate as soon as it merges.
- If the frontend needs a data structure changed to make charting easier, say so immediately, not during integration.
- Continuous integration beats big-bang integration: do not wait until Day 5.

## Local setup

```bash
npm install                 # installs both workspaces
docker compose up -d db     # local PostgreSQL 16
cp backend/.env.example backend/.env
npm run db:migrate          # apply the schema
npm run dev                 # API on http://localhost:3000
```

## Checks before opening a PR

```bash
npm run typecheck && npm run test
```

Both must pass. CI runs the same checks on every PR.
