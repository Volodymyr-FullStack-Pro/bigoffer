# BigOffer

Job aggregation platform: scrapers collect postings from job boards, a Trigger.dev pipeline deduplicates and
matches them against users' search profiles, and a Next.js app shows the matches.

Monorepo (pnpm + Turborepo):

- `packages/core` — normalisation, salary parsing, scoring
- `packages/scrapers` — source adapters (HTTP/RSS/JSON and Playwright-rendered pages)
- `packages/db` — Supabase types and client helpers
- `apps/jobs` — ingestion/matching pipeline (Trigger.dev tasks + a local `run-once` CLI)
- `apps/web` — Next.js web app

## Local setup

Requirements: Node 24+, pnpm 12, Docker (for the local Supabase stack), Supabase CLI.

```bash
pnpm install
pnpm db:start                      # supabase start — local Postgres/Auth/API in Docker
pnpm db:env                        # writes apps/web/.env.local and apps/jobs/.env.local from the running stack
pnpm --filter @jp/scrapers exec playwright install chromium   # browser for Work.ua / OLX
```

Optional keys go into `apps/jobs/.env.local` (see `apps/jobs/.env.example`), e.g. `JOOBLE_API_KEY`.

### Running the pipeline once (no Trigger.dev needed)

```bash
pnpm --filter @jp/jobs run-once                         # sync profiles, run queries that are due
pnpm --filter @jp/jobs run-once --force                 # run every query now
pnpm --filter @jp/jobs run-once --force --source=olx    # only one source
```

### Web app

```bash
pnpm --filter @jp/web dev
```

### Checks

```bash
pnpm lint && pnpm typecheck && pnpm test
supabase test db                                   # pgTAP database tests
pnpm --filter @jp/jobs test:integration            # pipeline tests against the local stack
pnpm --filter @jp/web test:e2e                     # Playwright E2E (starts the web app itself)
```

E2E uses port 3000 by default; if another local app occupies it, set `E2E_PORT`, e.g.
`E2E_PORT=3100 pnpm --filter @jp/web test:e2e`.

### Deploying the jobs pipeline

`pnpm --filter @jp/jobs deploy` (requires `trigger login` and `TRIGGER_PROJECT_REF`). The Trigger.dev Playwright
build extension is pinned to the same Playwright version as `packages/scrapers` — bump both together.
