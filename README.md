# BigOffer

Job aggregation platform: scrapers collect postings from job boards, a Trigger.dev pipeline deduplicates and
matches them against users' search profiles, and a Next.js app shows the matches.

Monorepo (pnpm + Turborepo):

- `packages/core` — normalisation, salary parsing, scoring
- `packages/scrapers` — source adapters (HTTP/RSS/JSON and Playwright-rendered pages)
- `packages/db` — Supabase types and client helpers
- `packages/ai` — provider-agnostic LLM client (Gemini) and AI tasks: job enrichment, "why it fits"
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

Personal-data AI (CV, letters, recruiter messages) needs a **paid** Gemini key in `apps/web/.env.local` as `GEMINI_API_KEY_PRIVATE`; E2E uses `AI_PROVIDER=fake` (with `ALLOW_FAKE_AI=1`).

Optional keys go into `apps/jobs/.env.local` (see `apps/jobs/.env.example`), e.g. `JOOBLE_API_KEY`.

### Running the pipeline once (no Trigger.dev needed)

```bash
pnpm --filter @jp/jobs run-once                         # sync profiles, run queries that are due
pnpm --filter @jp/jobs run-once --force                 # run every query now
pnpm --filter @jp/jobs run-once --force --source=olx    # only one source
```

Company ATS boards (Greenhouse, Lever, Ashby, Workable) and Telegram channels are polled from the `source_boards` table (seeded, plus boards discovered from links in collected jobs; a board is disabled after 3 failed runs in a row). `pnpm --filter @jp/jobs run-once --discover` runs board discovery on demand.

### AI enrichment (optional)

Put a free Google AI Studio key into `apps/jobs/.env` as `GEMINI_API_KEY_PUBLIC` (job postings only — the free tier
may be used for training, so no personal data ever goes through it). Without it the pipeline still works with
keyword scoring.

```bash
pnpm --filter @jp/jobs ai:smoke                 # one live call per AI task, prints the result
pnpm --filter @jp/jobs enrich-once --limit=10   # enrich matched jobs, rescore, then write "why it fits"
```

Limits: `AI_DAILY_LIMIT` requests per UTC day (default 900), `AI_MIN_INTERVAL_MS` between requests (default 4500).
A 429 from the provider stops the batch; the next scheduled run continues.

### Web app

`/today` — feed (desktop hotkeys J/K/S/H/A/O, mobile swipe), `/board` — application kanban (drag & drop, smart sort, today actions, add a card by link)

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
