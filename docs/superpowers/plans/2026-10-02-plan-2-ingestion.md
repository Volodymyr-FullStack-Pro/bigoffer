# План 2 — Конвейер вакансий: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каждый час собирать вакансии с 9 площадок по поисковым профилям пользователей, нормализовать, дедуплицировать, оценивать по ключевым словам и показывать пользователю список совпадений на странице «Today».

**Architecture:** Чистая логика (нормализация, детекторы, fingerprint, построение запросов, скоринг) — в `packages/core` (TDD). Адаптеры площадок — в новом `packages/scrapers` (общий HTTP-контекст с паузами/ретраями/circuit breaker-сигналом, тесты на сохранённых фикстурах). Оркестрация — в новом `apps/jobs`: функции конвейера поверх service-клиента Supabase (интеграционные тесты на локальной БД) и тонкие задачи Trigger.dev v4 (cron, очередь `concurrencyLimit: 1` на источник) плюс CLI `run-once` для локального запуска без облака. Веб получает настройки поиска и временный список совпадений (полноценная лента со свайпами — План 4).

**Tech Stack:** TypeScript 6.0.3, Zod 4, Vitest 5, fast-xml-parser 5, Trigger.dev SDK/CLI 4.6.4, Supabase (Postgres + pg_trgm), Next.js 16, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` (разделы 5.3–5.5, 6.1–6.4, 9). Дорожная карта: `docs/superpowers/plans/2026-10-01-roadmap.md`.

## Global Constraints

- Все Global Constraints Плана 1 действуют (TS 6.0.3, `@jp/` scope, Next 16 `proxy.ts`, RLS, Zod на границах, коммиты с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- **Конвенция БД:** каждая новая таблица — `revoke all … from anon, authenticated` → явные `grant` → `enable row level security` → политики. Новые функции — `revoke execute … from public, anon, authenticated`, если не нужны клиенту.
- Источники Плана 2 (`SourceId`): `dou`, `djinni`, `robotaua`, `jooble`, `remoteok`, `remotive`, `himalayas`, `wwr`, `hn`. Work.ua (Cloudflare 403) и Wellfound — вне плана (Chrome extension), LinkedIn — План 6 (inbound email).
- Адаптер **никогда** не пишет в БД; БД пишут только функции `apps/jobs/src/pipeline/*`.
- 403/429 от источника → `SourceBlockedError` → источник на паузу 1 час. 3 запуска подряд с 0 результатов → алерт (в Плане 2 — `logger.error`; Telegram — План 5).
- Не более одного одновременного запроса на источник; пауза 1–4 с между запросами страниц.
- Атрибуция: у каждой вакансии в UI видны название источника и ссылка на оригинал (требование RemoteOK/Remotive).
- Зарплата хранится как **месячная в USD** (`salary_min_usd`, `salary_max_usd`); годовые суммы делятся на 12; курсы — константы `FX_TO_USD` в core.
- Вакансия не видна пользователю, если она не релевантна профилю (ни одно ключевое слово/навык не найдено) — такие совпадения не создаются.
- AI-обогащение (роль, навыки, резюме на языке пользователя) — **не** в этом плане (План 3); колонки под него создаются сейчас.

## Структура файлов

```
packages/core/src/jobs/
  text.ts               decodeEntities, htmlToText, normalizeWhitespace
  normalize.ts          normalizeCompany, normalizeTitle, regionBucket, fingerprint
  detect.ts             detectRemote, detectSeniority, parseSalary, FX_TO_USD
  job.ts                SOURCE_IDS, REMOTE_TYPES, SENIORITIES, rawJobSchema, normalizeJob
  search.ts             searchProfileInputSchema, parseList, SearchProfile, buildSourceQueries
  score.ts              scoreJob
packages/scrapers/
  package.json tsconfig.json
  src/index.ts types.ts http.ts rss.ts jsonld.ts
  src/adapters/{dou,djinni,wwr,remoteok,remotive,himalayas,robotaua,jooble,hn}.ts
  src/adapters/index.ts  ADAPTERS
  scripts/capture-fixtures.mjs
  fixtures/*.{xml,html,json}
  test/*.test.ts
supabase/migrations/20261003000100_jobs_pipeline.sql
supabase/tests/database/002_jobs_pipeline.test.sql
apps/jobs/
  package.json tsconfig.json trigger.config.ts vitest.config.ts vitest.integration.config.ts .env.example
  src/env.ts db.ts
  src/pipeline/{repository,match,run-query,sync-profiles,expire}.ts
  src/trigger/{queues,schedule-queries,scrape-query,sync-profile,expire-jobs}.ts
  src/cli/run-once.ts
  test/pipeline.int.test.ts
apps/web/src/app/[locale]/(app)/
  search/{page.tsx, actions.ts, search-profile-form.tsx}
  today/{page.tsx, actions.ts, job-match-card.tsx}
apps/web/e2e/{search.spec.ts, today.spec.ts}
```

---

### Task 0: Предусловия (выполняет пользователь)

- [ ] **Step 1: Trigger.dev** — зарегистрироваться на https://cloud.trigger.dev (бесплатно), создать проект `bigoffer`. Скопировать **Project ref** (`proj_…`) и **DEV secret key** (`tr_dev_…`).
- [ ] **Step 2: Логин CLI** — `npx trigger.dev@4.6.4 login` (откроется браузер).
- [ ] **Step 3: Jooble (необязательно)** — запросить ключ на https://jooble.org/api/about. Без ключа адаптер Jooble пропускается.
- [ ] **Step 4:** значения вписываются в `apps/jobs/.env.local` в Task 11 (файл не коммитится). В чат ключи не присылать.

---

### Task 1: Схема конвейера вакансий + RLS-тесты

**Files:**
- Create: `supabase/migrations/20261003000100_jobs_pipeline.sql`, `supabase/tests/database/002_jobs_pipeline.test.sql`
- Modify: `packages/db/src/database.types.ts` (регенерация)

**Interfaces:**
- Produces таблицы: `companies(id, name, normalized_name unique, website, logo_url, created_at)`, `jobs(id, fingerprint unique, title, company_id, description_text, location, remote_type, seniority, salary_raw, salary_min_usd, salary_max_usd, tags, posted_at, first_seen_at, last_seen_at, status, role_id, skills, lang, summary, enriched_at, enrich_error)`, `job_postings(id, job_id, source_id, external_id, url, seen_at, unique(source_id, external_id))`, `search_queries(id, source_id, query_key unique, params, last_run_at, next_run_at)`, `source_runs(id, source_id, query_id, status, found, inserted, error, started_at, finished_at)`, `search_profiles(id, user_id, name, role_id, keywords, skills, exclude_keywords, seniority, locations, remote_type, salary_min_usd, is_active, created_at, updated_at)`, `search_profile_queries(search_profile_id, search_query_id)`, `job_matches(id, user_id, job_id, search_profile_id, score, breakdown, explanation, state, created_at, updated_at, unique(user_id, job_id))`; колонка `sources.consecutive_empty_runs`; функция `find_similar_job(p_company_id uuid, p_title text) returns uuid` (только service_role).
- Доступ `authenticated`: SELECT `companies/jobs/job_postings`; CRUD своих `search_profiles`; SELECT своих `job_matches` и UPDATE только колонки `state`. `search_queries`, `source_runs`, `search_profile_queries` — только service_role.

- [ ] **Step 1: Падающий pgTAP-тест**

`supabase/tests/database/002_jobs_pipeline.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev');

insert into public.companies (id, name, normalized_name)
  values ('c0000000-0000-0000-0000-000000000001', 'Acme', 'acme');
insert into public.jobs (id, fingerprint, title, company_id)
  values ('d0000000-0000-0000-0000-000000000001', 'fp-1', 'Senior React Developer',
          'c0000000-0000-0000-0000-000000000001');
insert into public.job_postings (job_id, source_id, external_id, url)
  values ('d0000000-0000-0000-0000-000000000001', 'dou', '1', 'https://jobs.dou.ua/x/1/');
insert into public.job_matches (user_id, job_id, score) values
  ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 80),
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001', 50);
insert into public.search_profiles (id, user_id, name, keywords) values
  ('e0000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B', '{react}');

-- service-side helpers
select is(public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'Senior React Developer.'),
  'd0000000-0000-0000-0000-000000000001'::uuid, 'find_similar_job finds near-identical title');
select is(public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'Accountant'),
  null::uuid, 'find_similar_job ignores different title');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.jobs), 1, 'reads global jobs');
select is((select count(*)::int from public.job_postings), 1, 'reads global postings');
select is((select count(*)::int from public.job_matches), 1, 'sees only own matches');
select is((select score::int from public.job_matches), 80, 'own match score visible');
select lives_ok($$ update public.job_matches set state = 'hidden' where user_id = '11111111-1111-1111-1111-111111111111' $$,
  'can change own match state');
select is((select state from public.job_matches), 'hidden', 'state updated');
select throws_ok($$ update public.job_matches set score = 100 $$, '42501', null, 'cannot change score');
select throws_ok($$ insert into public.job_matches (user_id, job_id, score)
  values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001', 1) $$,
  '42501', null, 'cannot insert matches');
select throws_ok($$ select * from public.search_queries $$, '42501', null, 'search_queries are service-only');
select throws_ok($$ select public.find_similar_job('c0000000-0000-0000-0000-000000000001', 'x') $$,
  '42501', null, 'cannot execute find_similar_job');
select lives_ok($$ insert into public.search_profiles (user_id, name, keywords)
  values ('11111111-1111-1111-1111-111111111111', 'Mine', '{full stack}') $$, 'can create own search profile');
select is((select count(*)::int from public.search_profiles), 1, 'sees only own search profiles');
select throws_ok($$ insert into public.search_profiles (user_id, name)
  values ('22222222-2222-2222-2222-222222222222', 'Evil') $$, '42501', null, 'cannot create profile for another user');

reset role;
set local role anon;
select throws_ok($$ select * from public.jobs $$, '42501', null, 'anon cannot read jobs');

select * from finish();
rollback;
```

Run: `supabase test db`
Expected: FAIL — `relation "public.companies" does not exist`.

- [ ] **Step 2: Миграция**

`supabase/migrations/20261003000100_jobs_pipeline.sql`:
```sql
-- Jobs pipeline (Plan 2). Convention: explicit revoke → grant → RLS on every table.
create extension if not exists pg_trgm with schema extensions;

alter table public.sources add column consecutive_empty_runs int not null default 0;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  website text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  title text not null,
  company_id uuid not null references public.companies (id),
  description_text text not null default '',
  location text,
  remote_type text not null default 'unknown'
    check (remote_type in ('remote', 'hybrid', 'office', 'unknown')),
  seniority text check (seniority in ('intern', 'junior', 'middle', 'senior', 'lead')),
  salary_raw text,
  salary_min_usd int,
  salary_max_usd int,
  tags text[] not null default '{}',
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'expired')),
  -- AI enrichment (Plan 3)
  role_id uuid references public.roles (id),
  skills text[] not null default '{}',
  lang text,
  summary jsonb,
  enriched_at timestamptz,
  enrich_error text
);
create index jobs_title_trgm on public.jobs using gin (title extensions.gin_trgm_ops);
create index jobs_status_first_seen on public.jobs (status, first_seen_at desc);
create index jobs_company_first_seen on public.jobs (company_id, first_seen_at desc);

create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  source_id text not null references public.sources (id),
  external_id text not null,
  url text not null,
  seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index job_postings_job on public.job_postings (job_id);

create table public.search_queries (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources (id),
  query_key text not null unique,
  params jsonb not null default '{}',
  last_run_at timestamptz,
  next_run_at timestamptz not null default now()
);

create table public.source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources (id),
  query_id uuid references public.search_queries (id) on delete set null,
  status text not null default 'running' check (status in ('running', 'ok', 'error', 'blocked')),
  found int not null default 0,
  inserted int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index source_runs_source_started on public.source_runs (source_id, started_at desc);

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  role_id uuid references public.roles (id),
  keywords text[] not null default '{}',
  skills text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  seniority text[] not null default '{}',
  locations text[] not null default '{}',
  remote_type text not null default 'any' check (remote_type in ('remote', 'hybrid', 'office', 'any')),
  salary_min_usd int check (salary_min_usd is null or salary_min_usd >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index search_profiles_user on public.search_profiles (user_id);
create trigger search_profiles_updated_at before update on public.search_profiles
  for each row execute function public.set_updated_at();

create table public.search_profile_queries (
  search_profile_id uuid not null references public.search_profiles (id) on delete cascade,
  search_query_id uuid not null references public.search_queries (id) on delete cascade,
  primary key (search_profile_id, search_query_id)
);
create index search_profile_queries_query on public.search_profile_queries (search_query_id);

create table public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  search_profile_id uuid references public.search_profiles (id) on delete set null,
  score smallint not null check (score between 0 and 100),
  breakdown jsonb not null default '{}',
  explanation jsonb,
  state text not null default 'new' check (state in ('new', 'seen', 'hidden', 'saved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index job_matches_feed on public.job_matches (user_id, state, created_at desc);
create trigger job_matches_updated_at before update on public.job_matches
  for each row execute function public.set_updated_at();

-- grants
revoke all on public.companies, public.jobs, public.job_postings, public.search_queries,
  public.source_runs, public.search_profiles, public.search_profile_queries, public.job_matches
  from anon, authenticated;
grant select on public.companies, public.jobs, public.job_postings to authenticated;
grant select, insert, update, delete on public.search_profiles to authenticated;
grant select on public.job_matches to authenticated;
grant update (state) on public.job_matches to authenticated;

-- RLS
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.job_postings enable row level security;
alter table public.search_queries enable row level security;
alter table public.source_runs enable row level security;
alter table public.search_profiles enable row level security;
alter table public.search_profile_queries enable row level security;
alter table public.job_matches enable row level security;

create policy "companies readable" on public.companies for select to authenticated using (true);
create policy "jobs readable" on public.jobs for select to authenticated using (true);
create policy "postings readable" on public.job_postings for select to authenticated using (true);
create policy "own search profiles" on public.search_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own matches select" on public.job_matches for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own matches update" on public.job_matches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- dedupe helper: same company, near-identical title, seen in the last 14 days
create or replace function public.find_similar_job(p_company_id uuid, p_title text)
returns uuid language sql stable set search_path = '' as $$
  select j.id
  from public.jobs j
  where j.company_id = p_company_id
    and j.first_seen_at > now() - interval '14 days'
    and extensions.similarity(j.title, p_title) > 0.9
  order by extensions.similarity(j.title, p_title) desc
  limit 1
$$;
revoke execute on function public.find_similar_job(uuid, text) from public, anon, authenticated;
```

- [ ] **Step 3: Применить, тесты, типы**

Run: `supabase db reset && supabase test db`
Expected: `001_foundation.test.sql .. ok`, `002_jobs_pipeline.test.sql .. ok`, `All tests successful.`

Run: `pnpm db:types && pnpm --filter @jp/db typecheck`
Expected: в `database.types.ts` есть `job_matches`, `find_similar_job`; typecheck чистый.

- [ ] **Step 4: Commit**

```bash
git add supabase packages/db
git commit -m "feat(db): add jobs pipeline schema with RLS and similarity dedupe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: core — текст и нормализация

**Files:**
- Create: `packages/core/src/jobs/text.ts`, `packages/core/src/jobs/normalize.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/jobs/text.test.ts`, `packages/core/src/jobs/normalize.test.ts`

**Interfaces:**
- Produces: `decodeEntities(s: string): string`, `htmlToText(html: string): string`, `normalizeWhitespace(s: string): string`, `normalizeCompany(name: string): string`, `normalizeTitle(title: string): string`, `regionBucket(location: string | null, remoteType: RemoteType): string`, `fingerprint(input: { company: string; title: string; region: string }): Promise<string>` (64 hex).
- `RemoteType` импортируется из `./job` (Task 4) — чтобы не было циклов, в этой задаче объявить тип в `normalize.ts` как `type RemoteType = 'remote' | 'hybrid' | 'office' | 'unknown'` и **не экспортировать**; Task 4 экспортирует публичный.

- [ ] **Step 1: Падающие тесты**

`packages/core/src/jobs/text.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeEntities, htmlToText, normalizeWhitespace } from './text';

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('A &amp; B &lt;3 &#39;x&#39; &#x2F; &nbsp;!')).toBe("A & B <3 'x' /  !");
  });
});

describe('htmlToText', () => {
  it('keeps paragraph and list structure', () => {
    const html = '<p>About&nbsp;us</p><ul><li>React</li><li>Node</li></ul><p>Line<br>break</p>';
    expect(htmlToText(html)).toBe('About us\n• React\n• Node\nLine\nbreak');
  });
  it('passes plain text through and drops blank lines', () => {
    expect(htmlToText('One\n\n\n\nTwo   words')).toBe('One\nTwo words');
  });
});

describe('normalizeWhitespace', () => {
  it('collapses all whitespace', () => {
    expect(normalizeWhitespace('  a \n\t b  ')).toBe('a b');
  });
});
```

`packages/core/src/jobs/normalize.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fingerprint, normalizeCompany, normalizeTitle, regionBucket } from './normalize';

describe('normalizeCompany', () => {
  it('drops legal suffixes, quotes and punctuation', () => {
    expect(normalizeCompany('"ІНФОТЕХ" ТОВ')).toBe('інфотех');
    expect(normalizeCompany('Acme, Inc.')).toBe('acme');
    expect(normalizeCompany('Bjak ')).toBe('bjak');
  });
});

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Senior Front-End Developer (React + TS)!')).toBe('senior front end developer react ts');
  });
});

describe('regionBucket', () => {
  it('returns remote for remote jobs', () => {
    expect(regionBucket('Kyiv', 'remote')).toBe('remote');
  });
  it('maps city spellings to one bucket', () => {
    expect(regionBucket('Київ', 'office')).toBe('kyiv');
    expect(regionBucket('Киев', 'hybrid')).toBe('kyiv');
    expect(regionBucket('Lviv, Ukraine', 'office')).toBe('lviv');
  });
  it('falls back to normalized text or unknown', () => {
    expect(regionBucket('Berlin', 'office')).toBe('berlin');
    expect(regionBucket(null, 'unknown')).toBe('unknown');
  });
});

describe('fingerprint', () => {
  it('is stable across cosmetic differences', async () => {
    const a = await fingerprint({ company: 'Acme, Inc.', title: 'Senior React Developer', region: 'remote' });
    const b = await fingerprint({ company: 'ACME', title: 'senior react developer!', region: 'remote' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for different titles', async () => {
    const a = await fingerprint({ company: 'Acme', title: 'React Developer', region: 'remote' });
    const b = await fingerprint({ company: 'Acme', title: 'Vue Developer', region: 'remote' });
    expect(a).not.toBe(b);
  });
});
```

Run: `pnpm --filter @jp/core test jobs`
Expected: FAIL — `Failed to resolve import "./text"` / `"./normalize"`.

- [ ] **Step 2: Реализация**

`packages/core/src/jobs/text.ts`:
```ts
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name: string) => NAMED[name] ?? `&${name};`);
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(withBreaks)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}
```

`packages/core/src/jobs/normalize.ts`:
```ts
import { decodeEntities } from './text';

type RemoteType = 'remote' | 'hybrid' | 'office' | 'unknown';

const COMPANY_SUFFIXES = new Set([
  'llc', 'inc', 'ltd', 'gmbh', 'corp', 'corporation', 'co', 'plc', 'sa', 'bv',
  'тов', 'ооо', 'фоп', 'пп', 'тзов',
]);

function tokens(s: string): string[] {
  return decodeEntities(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function normalizeCompany(name: string): string {
  return tokens(name)
    .filter((t) => !COMPANY_SUFFIXES.has(t))
    .join(' ');
}

export function normalizeTitle(title: string): string {
  return tokens(title).join(' ');
}

const CITY_BUCKETS: Record<string, string[]> = {
  kyiv: ['kyiv', 'kiev', 'київ', 'киев'],
  lviv: ['lviv', 'львів', 'львов'],
  kharkiv: ['kharkiv', 'харків', 'харьков'],
  odesa: ['odesa', 'odessa', 'одеса', 'одесса'],
  dnipro: ['dnipro', 'дніпро', 'днепр'],
};

export function regionBucket(location: string | null, remoteType: RemoteType): string {
  if (remoteType === 'remote') return 'remote';
  if (!location) return 'unknown';
  const words = new Set(tokens(location));
  for (const [bucket, names] of Object.entries(CITY_BUCKETS)) {
    if (names.some((n) => words.has(n))) return bucket;
  }
  return tokens(location).join(' ') || 'unknown';
}

export async function fingerprint(input: { company: string; title: string; region: string }): Promise<string> {
  const key = `${normalizeCompany(input.company)}|${normalizeTitle(input.title)}|${input.region}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
```

`packages/core/src/index.ts` — добавить:
```ts
export * from './jobs/text';
export * from './jobs/normalize';
```

- [ ] **Step 3: Тесты проходят**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): add text, company/title normalization and job fingerprint

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: core — детекторы remote/грейда/зарплаты

**Files:**
- Create: `packages/core/src/jobs/detect.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/jobs/detect.test.ts`

**Interfaces:**
- Produces: `detectRemote(text: string): 'remote' | 'hybrid' | 'office' | 'unknown'`, `detectSeniority(title: string): 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null`, `FX_TO_USD: Record<'USD' | 'EUR' | 'UAH', number>`, `parseSalary(raw: string, period?: 'month' | 'year'): { minUsd: number | null; maxUsd: number | null } | null` — помесячно в USD; суммы > 20 000 USD или `period: 'year'` делятся на 12.

- [ ] **Step 1: Падающий тест**

`packages/core/src/jobs/detect.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { detectRemote, detectSeniority, parseSalary } from './detect';

describe('detectRemote', () => {
  it.each([
    ['Fully remote, work from anywhere', 'remote'],
    ['Київ, віддалено', 'remote'],
    ['Удаленная работа', 'remote'],
    ['Hybrid: 2 days in office', 'hybrid'],
    ['Офіс у Львові', 'office'],
    ['On-site in Berlin', 'office'],
    ['Great team', 'unknown'],
  ] as const)('%s → %s', (text, expected) => {
    expect(detectRemote(text)).toBe(expected);
  });
});

describe('detectSeniority', () => {
  it.each([
    ['Senior React Developer', 'senior'],
    ['Sr. Backend Engineer', 'senior'],
    ['Team Lead / Senior Node.js', 'lead'],
    ['Junior/Middle Frontend', 'middle'],
    ['Junior QA', 'junior'],
    ['Стажер-розробник', 'intern'],
    ['Мідл Python розробник', 'middle'],
    ['Full Stack Developer', null],
  ] as const)('%s → %s', (title, expected) => {
    expect(detectSeniority(title)).toBe(expected);
  });
});

describe('parseSalary', () => {
  it('parses a USD range', () => {
    expect(parseSalary('$3000–4500')).toEqual({ minUsd: 3000, maxUsd: 4500 });
  });
  it('parses "from" in UAH and converts', () => {
    expect(parseSalary('від 41 500 грн')).toEqual({ minUsd: 1000, maxUsd: null });
  });
  it('parses "up to" with currency after number', () => {
    expect(parseSalary('до 3000 $')).toEqual({ minUsd: null, maxUsd: 3000 });
  });
  it('converts annual amounts to monthly', () => {
    expect(parseSalary('$120k - $150k')).toEqual({ minUsd: 10000, maxUsd: 12500 });
    expect(parseSalary('98500 - 164000 USD', 'year')).toEqual({ minUsd: 8208, maxUsd: 13667 });
  });
  it('handles EUR', () => {
    expect(parseSalary('€4,000')).toEqual({ minUsd: 4320, maxUsd: 4320 });
  });
  it('returns null when nothing parseable', () => {
    expect(parseSalary('competitive')).toBeNull();
  });
});
```

Run: `pnpm --filter @jp/core test detect`
Expected: FAIL — `Failed to resolve import "./detect"`.

- [ ] **Step 2: Реализация**

`packages/core/src/jobs/detect.ts`:
```ts
export function detectRemote(text: string): 'remote' | 'hybrid' | 'office' | 'unknown' {
  const t = text.toLowerCase();
  if (/hybrid|гібрид|гибрид/.test(t)) return 'hybrid';
  if (/\bremote(ly)?\b|anywhere|work from home|\bwfh\b|віддален|дистанційн|удален|удалён/.test(t)) return 'remote';
  if (/\bon-?site\b|\boffice\b|офіс|офис/.test(t)) return 'office';
  return 'unknown';
}

const SENIORITY_PATTERNS: [NonNullable<ReturnType<typeof detectSeniority>>, RegExp][] = [
  ['lead', /\b(lead|principal|staff|head of|architect)\b|тімлід|тимлид|техлід|техлид/i],
  ['senior', /\b(senior|sr\.?)(?=\s|$|[^a-z])|сеньйор|сеньор|синьор/i],
  ['middle', /\b(middle|mid-level|mid)\b|мідл|мидл/i],
  ['junior', /\b(junior|jr\.?)(?=\s|$|[^a-z])|джуніор|джуниор/i],
  ['intern', /\b(intern|internship|trainee)\b|стажер|стажист|стажування/i],
];

export function detectSeniority(title: string): 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null {
  for (const [level, pattern] of SENIORITY_PATTERNS) {
    if (pattern.test(title)) return level;
  }
  return null;
}

/** Approximate conversion rates to USD; refresh occasionally. */
export const FX_TO_USD = { USD: 1, EUR: 1.08, UAH: 1 / 41.5 } as const;

function detectCurrency(raw: string): keyof typeof FX_TO_USD {
  const t = raw.toLowerCase();
  if (/€|eur/.test(t)) return 'EUR';
  if (/грн|uah|₴/.test(t)) return 'UAH';
  return 'USD';
}

function numbers(raw: string): number[] {
  const out: number[] = [];
  for (const m of raw.matchAll(/(\d[\d\s,.]*\d|\d)\s*(k\b)?/gi)) {
    const digits = m[1]!.replace(/[\s,]/g, '').replace(/\.(?=\d{3}\b)/g, '');
    let value = Number.parseFloat(digits);
    if (m[2]) value *= 1000;
    if (Number.isFinite(value) && value >= 100) out.push(value);
  }
  return out;
}

export function parseSalary(
  raw: string,
  period?: 'month' | 'year',
): { minUsd: number | null; maxUsd: number | null } | null {
  const values = numbers(raw);
  if (values.length === 0) return null;
  const rate = FX_TO_USD[detectCurrency(raw)];
  const t = raw.toLowerCase();
  const isUpTo = /(^|\s)(до|up to|to)\s/.test(t) && values.length === 1;
  const isFrom = /(^|\s)(від|от|from)\s/.test(t) && values.length === 1;

  let min: number | null = values[0]!;
  let max: number | null = values.length > 1 ? values[1]! : values[0]!;
  if (isUpTo) min = null;
  if (isFrom) max = null;

  const toMonthlyUsd = (v: number | null): number | null => {
    if (v == null) return null;
    let usd = v * rate;
    if (period === 'year' || (period !== 'month' && usd > 20000)) usd /= 12;
    return Math.round(usd);
  };
  return { minUsd: toMonthlyUsd(min), maxUsd: toMonthlyUsd(max) };
}
```

`packages/core/src/index.ts` — добавить `export * from './jobs/detect';`

- [ ] **Step 3: Тесты проходят**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS. Если отдельный кейс расходится из-за округления — исправлять реализацию, не ожидание.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): detect remote type, seniority and normalize salaries to monthly USD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: core — схема вакансии и `normalizeJob`

**Files:**
- Create: `packages/core/src/jobs/job.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/jobs/normalize.ts` (импорт публичного `RemoteType`)
- Test: `packages/core/src/jobs/job.test.ts`

**Interfaces:**
- Consumes: Task 2–3.
- Produces:
  - `SOURCE_IDS = ['dou','djinni','robotaua','jooble','remoteok','remotive','himalayas','wwr','hn'] as const`, `type SourceId`
  - `REMOTE_TYPES`, `type RemoteType`, `SENIORITIES = ['intern','junior','middle','senior','lead'] as const`, `type Seniority`
  - `rawJobSchema` / `type RawJob = z.input<typeof rawJobSchema>`: `{ externalId: string; url: string; title: string; company: string; description?: string (HTML или текст); location?: string | null; salaryRaw?: string | null; salaryPeriod?: 'month' | 'year'; postedAt?: string | number | Date | null; remoteHint?: RemoteType; tags?: string[] }`
  - `type NormalizedJob = { externalId; url; title; company; companyNormalized; descriptionText; location: string | null; remoteType: RemoteType; seniority: Seniority | null; salaryRaw: string | null; salaryMinUsd: number | null; salaryMaxUsd: number | null; postedAt: Date | null; tags: string[]; fingerprint: string }`
  - `normalizeJob(raw: RawJob): Promise<NormalizedJob | null>` (null для невалидных)

- [ ] **Step 1: Падающий тест**

`packages/core/src/jobs/job.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { normalizeJob } from './job';

const base = {
  externalId: '302434',
  url: 'https://jobs.dou.ua/companies/x/vacancies/302434/',
  title: 'Senior Front-end Developer (React &amp; TS)',
  company: '"ІНФОТЕХ"',
  description: '<p>Віддалено. React, TypeScript</p>',
  location: 'Київ',
  salaryRaw: '$3000-4000',
  postedAt: 'Thu, 01 Oct 2026 16:26:14 +0300',
};

describe('normalizeJob', () => {
  it('normalizes a valid raw job', async () => {
    const job = await normalizeJob(base);
    expect(job).not.toBeNull();
    expect(job!.title).toBe('Senior Front-end Developer (React & TS)');
    expect(job!.company).toBe('"ІНФОТЕХ"');
    expect(job!.companyNormalized).toBe('інфотех');
    expect(job!.descriptionText).toBe('Віддалено. React, TypeScript');
    expect(job!.remoteType).toBe('remote');
    expect(job!.seniority).toBe('senior');
    expect(job!.salaryMinUsd).toBe(3000);
    expect(job!.salaryMaxUsd).toBe(4000);
    expect(job!.postedAt?.toISOString()).toBe('2026-10-01T13:26:14.000Z');
    expect(job!.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('prefers remoteHint over detection', async () => {
    const job = await normalizeJob({ ...base, description: 'office', remoteHint: 'remote' });
    expect(job!.remoteType).toBe('remote');
  });

  it('accepts epoch seconds for postedAt', async () => {
    const job = await normalizeJob({ ...base, postedAt: 1790950918 });
    expect(job!.postedAt?.getUTCFullYear()).toBe(2026);
  });

  it('returns null for invalid input', async () => {
    expect(await normalizeJob({ ...base, url: 'not a url' })).toBeNull();
    expect(await normalizeJob({ ...base, title: '   ' })).toBeNull();
  });
});
```

Run: `pnpm --filter @jp/core test job.test`
Expected: FAIL — `Failed to resolve import "./job"`.

- [ ] **Step 2: Реализация**

`packages/core/src/jobs/job.ts`:
```ts
import { z } from 'zod';
import { detectRemote, detectSeniority, parseSalary } from './detect';
import { fingerprint, normalizeCompany, regionBucket } from './normalize';
import { decodeEntities, htmlToText, normalizeWhitespace } from './text';

export const SOURCE_IDS = [
  'dou', 'djinni', 'robotaua', 'jooble', 'remoteok', 'remotive', 'himalayas', 'wwr', 'hn',
] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

export const REMOTE_TYPES = ['remote', 'hybrid', 'office', 'unknown'] as const;
export type RemoteType = (typeof REMOTE_TYPES)[number];

export const SENIORITIES = ['intern', 'junior', 'middle', 'senior', 'lead'] as const;
export type Seniority = (typeof SENIORITIES)[number];

const cleanText = z.string().transform((s) => normalizeWhitespace(decodeEntities(s))).pipe(z.string().min(1));

export const rawJobSchema = z.object({
  externalId: z.string().min(1),
  url: z.url({ protocol: /^https?$/ }),
  title: cleanText,
  company: cleanText,
  description: z.string().default(''),
  location: z.string().nullable().default(null),
  salaryRaw: z.string().nullable().default(null),
  salaryPeriod: z.enum(['month', 'year']).optional(),
  postedAt: z
    .union([z.string(), z.number(), z.date()])
    .nullable()
    .default(null)
    .transform((v) => {
      if (v == null || v === '') return null;
      const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
      return Number.isNaN(d.getTime()) ? null : d;
    }),
  remoteHint: z.enum(REMOTE_TYPES).optional(),
  tags: z.array(z.string()).default([]),
});

export type RawJob = z.input<typeof rawJobSchema>;

export type NormalizedJob = {
  externalId: string;
  url: string;
  title: string;
  company: string;
  companyNormalized: string;
  descriptionText: string;
  location: string | null;
  remoteType: RemoteType;
  seniority: Seniority | null;
  salaryRaw: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  postedAt: Date | null;
  tags: string[];
  fingerprint: string;
};

export async function normalizeJob(raw: RawJob): Promise<NormalizedJob | null> {
  const parsed = rawJobSchema.safeParse(raw);
  if (!parsed.success) return null;
  const r = parsed.data;

  const descriptionText = htmlToText(r.description).slice(0, 20_000);
  const location = r.location ? normalizeWhitespace(decodeEntities(r.location)) || null : null;
  const remoteType =
    r.remoteHint ?? detectRemote(`${r.title} ${location ?? ''} ${descriptionText.slice(0, 3000)}`);
  const salary = r.salaryRaw ? parseSalary(r.salaryRaw, r.salaryPeriod) : null;
  const companyNormalized = normalizeCompany(r.company) || r.company.toLowerCase();

  return {
    externalId: r.externalId,
    url: r.url,
    title: r.title,
    company: r.company,
    companyNormalized,
    descriptionText,
    location,
    remoteType,
    seniority: detectSeniority(r.title),
    salaryRaw: r.salaryRaw,
    salaryMinUsd: salary?.minUsd ?? null,
    salaryMaxUsd: salary?.maxUsd ?? null,
    postedAt: r.postedAt,
    tags: r.tags,
    fingerprint: await fingerprint({
      company: r.company,
      title: r.title,
      region: regionBucket(location, remoteType),
    }),
  };
}
```

В `packages/core/src/jobs/normalize.ts` заменить локальный `type RemoteType = …` на `import type { RemoteType } from './job';`.

`packages/core/src/index.ts` — добавить `export * from './jobs/job';`

- [ ] **Step 3: Тесты проходят**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): add raw job schema and normalizeJob

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: core — поисковые профили и построение запросов к источникам

**Files:**
- Create: `packages/core/src/jobs/search.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/jobs/search.test.ts`

**Interfaces:**
- Produces:
  - `parseList(text: string, max?: number): string[]` — делит по запятым/переводам строк, trim, убирает пустые и дубликаты (без учёта регистра), обрезает до `max` (по умолчанию 30).
  - `SEARCH_REMOTE_TYPES = ['any','remote','hybrid','office'] as const`
  - `searchProfileInputSchema` — `{ id?: uuid; name: 1..80; keywords: string[] 1..5; skills: string[] ≤30; excludeKeywords: string[] ≤30; seniority: Seniority[]; locations: string[] ≤10; remoteType: 'any'|'remote'|'hybrid'|'office'; salaryMinUsd: number | null; isActive: boolean }`, `type SearchProfileInput`
  - `type SearchProfile = Omit<SearchProfileInput,'id'|'name'|'isActive'> & { id: string; userId: string }`
  - `type SourceQuerySpec = { sourceId: SourceId; params: Record<string, string>; queryKey: string }`
  - `buildSourceQueries(profile: Pick<SearchProfile,'keywords'|'skills'>): SourceQuerySpec[]` — поисковые источники (`dou`→`search`, `robotaua`→`keyWords`, `jooble`→`keywords`, `remotive`→`search`, `himalayas`→`q`) получают по одному запросу на каждое из первых 3 ключевых слов; `djinni` — по одному на каждый распознанный `primary_keyword` (до 2) или один запрос без параметров; `remoteok` — `tag` из первого навыка/ключевого слова (slug); `wwr` и `hn` — один запрос без параметров. `queryKey = sourceId + ':' + JSON(params с отсортированными ключами, значения в нижнем регистре)`. Дубликаты по `queryKey` убираются.
  - `DJINNI_PRIMARY_KEYWORDS: Record<string, string>` (нижний регистр → значение Djinni).

- [ ] **Step 1: Падающий тест**

`packages/core/src/jobs/search.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { buildSourceQueries, parseList, searchProfileInputSchema } from './search';

describe('parseList', () => {
  it('splits, trims and dedupes case-insensitively', () => {
    expect(parseList('React, node.js\nReact ,, TypeScript')).toEqual(['React', 'node.js', 'TypeScript']);
  });
  it('respects max', () => {
    expect(parseList('a,b,c', 2)).toEqual(['a', 'b']);
  });
});

describe('searchProfileInputSchema', () => {
  it('accepts a valid profile', () => {
    const r = searchProfileInputSchema.safeParse({
      name: 'Full-Stack remote',
      keywords: ['full stack', 'react developer'],
      skills: ['React', 'Node.js'],
      excludeKeywords: ['1C'],
      seniority: ['middle', 'senior'],
      locations: [],
      remoteType: 'remote',
      salaryMinUsd: 3000,
      isActive: true,
    });
    expect(r.success).toBe(true);
  });
  it('requires at least one keyword', () => {
    const r = searchProfileInputSchema.safeParse({
      name: 'x', keywords: [], skills: [], excludeKeywords: [], seniority: [], locations: [],
      remoteType: 'any', salaryMinUsd: null, isActive: true,
    });
    expect(r.success).toBe(false);
  });
});

describe('buildSourceQueries', () => {
  const specs = buildSourceQueries({ keywords: ['Full Stack', 'React Developer'], skills: ['React', 'Node.js'] });
  const bySource = (id: string) => specs.filter((s) => s.sourceId === id);

  it('creates one query per keyword for search sources', () => {
    expect(bySource('dou').map((s) => s.params)).toEqual([{ search: 'full stack' }, { search: 'react developer' }]);
    expect(bySource('robotaua')).toHaveLength(2);
    expect(bySource('himalayas')[0]!.params).toEqual({ q: 'full stack' });
  });
  it('maps skills to djinni primary keywords', () => {
    expect(bySource('djinni').map((s) => s.params)).toEqual([
      { primary_keyword: 'React.js' },
      { primary_keyword: 'Node.js' },
    ]);
  });
  it('uses a slug tag for remoteok and no params for feeds', () => {
    expect(bySource('remoteok')[0]!.params).toEqual({ tag: 'react' });
    expect(bySource('wwr')[0]!.params).toEqual({});
    expect(bySource('hn')[0]!.params).toEqual({});
  });
  it('builds deterministic unique query keys', () => {
    expect(bySource('dou')[0]!.queryKey).toBe('dou:{"search":"full stack"}');
    expect(new Set(specs.map((s) => s.queryKey)).size).toBe(specs.length);
  });
});
```

Run: `pnpm --filter @jp/core test search`
Expected: FAIL — `Failed to resolve import "./search"`.

- [ ] **Step 2: Реализация**

`packages/core/src/jobs/search.ts`:
```ts
import { z } from 'zod';
import { SENIORITIES, type SourceId } from './job';

export function parseList(text: string, max = 30): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,\n]/)) {
    const value = part.trim();
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

export const SEARCH_REMOTE_TYPES = ['any', 'remote', 'hybrid', 'office'] as const;

const term = z.string().trim().min(1).max(60);

export const searchProfileInputSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  keywords: z.array(term).min(1).max(5),
  skills: z.array(term).max(30),
  excludeKeywords: z.array(term).max(30),
  seniority: z.array(z.enum(SENIORITIES)),
  locations: z.array(term).max(10),
  remoteType: z.enum(SEARCH_REMOTE_TYPES),
  salaryMinUsd: z.number().int().min(0).max(100_000).nullable(),
  isActive: z.boolean(),
});

export type SearchProfileInput = z.infer<typeof searchProfileInputSchema>;
export type SearchProfile = Omit<SearchProfileInput, 'id' | 'name' | 'isActive'> & {
  id: string;
  userId: string;
};

export type SourceQuerySpec = { sourceId: SourceId; params: Record<string, string>; queryKey: string };

export const DJINNI_PRIMARY_KEYWORDS: Record<string, string> = {
  javascript: 'JavaScript',
  js: 'JavaScript',
  typescript: 'JavaScript',
  react: 'React.js',
  'react.js': 'React.js',
  'next.js': 'React.js',
  node: 'Node.js',
  'node.js': 'Node.js',
  nestjs: 'Node.js',
  python: 'Python',
  java: 'Java',
  php: 'PHP',
  'c#': 'C# / .NET',
  '.net': 'C# / .NET',
  golang: 'Golang',
  go: 'Golang',
  ruby: 'Ruby',
  ios: 'iOS',
  android: 'Android',
  flutter: 'Flutter',
  devops: 'DevOps',
  qa: 'QA',
  'project manager': 'Project Manager',
  'product manager': 'Product Manager',
  designer: 'Design',
  marketing: 'Marketing',
  sales: 'Sales',
  hr: 'HR',
  recruiter: 'HR',
};

const SEARCH_SOURCES: [SourceId, string][] = [
  ['dou', 'search'],
  ['robotaua', 'keyWords'],
  ['jooble', 'keywords'],
  ['remotive', 'search'],
  ['himalayas', 'q'],
];

function queryKey(sourceId: SourceId, params: Record<string, string>): string {
  const sorted = Object.fromEntries(
    Object.keys(params)
      .sort()
      .map((k) => [k, params[k]!]),
  );
  return `${sourceId}:${JSON.stringify(sorted)}`;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/\.js$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function buildSourceQueries(profile: Pick<SearchProfile, 'keywords' | 'skills'>): SourceQuerySpec[] {
  const keywords = profile.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 3);
  const specs: SourceQuerySpec[] = [];
  const add = (sourceId: SourceId, params: Record<string, string>) => {
    specs.push({ sourceId, params, queryKey: queryKey(sourceId, params) });
  };

  for (const [sourceId, param] of SEARCH_SOURCES) {
    for (const keyword of keywords) add(sourceId, { [param]: keyword });
  }

  const djinni = [
    ...new Set(
      [...profile.skills, ...profile.keywords]
        .map((t) => DJINNI_PRIMARY_KEYWORDS[t.trim().toLowerCase()])
        .filter((v): v is string => Boolean(v)),
    ),
  ].slice(0, 2);
  if (djinni.length === 0) add('djinni', {});
  for (const primary of djinni) add('djinni', { primary_keyword: primary });

  const tagSource = profile.skills[0] ?? profile.keywords[0];
  const tag = tagSource ? slug(tagSource) : '';
  add('remoteok', tag ? { tag } : {});
  add('wwr', {});
  add('hn', {});

  const unique = new Map(specs.map((s) => [s.queryKey, s]));
  return [...unique.values()];
}
```

`packages/core/src/index.ts` — добавить `export * from './jobs/search';`

- [ ] **Step 3: Тесты проходят**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): add search profile schema and per-source query builder

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: core — скоринг совпадений (ключевые слова)

**Files:**
- Create: `packages/core/src/jobs/score.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/jobs/score.test.ts`

**Interfaces:**
- Consumes: `SearchProfile`, `Seniority`, `RemoteType`, `regionBucket`.
- Produces:
  - `type ScorableJob = { title: string; descriptionText: string; tags: string[]; remoteType: RemoteType; seniority: Seniority | null; location: string | null; salaryMinUsd: number | null; salaryMaxUsd: number | null; skills?: string[] }`
  - `type MatchBreakdown = { skills: number; role: number; seniority: number; location: number; salary: number; matchedSkills: string[]; excludedBy: string | null }`
  - `scoreJob(profile: SearchProfile, job: ScorableJob): { score: number; hidden: boolean; breakdown: MatchBreakdown } | null` — `null`, если вакансия нерелевантна (нет ни ключевого слова, ни навыка). Веса: навыки 35, роль 25, грейд 15, локация/remote 15, зарплата 10 (спека 6.3 п.4). Стоп-слово в заголовке или описании → `hidden: true`.

- [ ] **Step 1: Падающий тест**

`packages/core/src/jobs/score.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { SearchProfile } from './search';
import { scoreJob, type ScorableJob } from './score';

const profile: SearchProfile = {
  id: 'p1',
  userId: 'u1',
  keywords: ['full stack', 'react developer'],
  skills: ['React', 'Node.js', 'PostgreSQL', 'Go'],
  excludeKeywords: ['1C', 'gambling'],
  seniority: ['middle', 'senior'],
  locations: [],
  remoteType: 'remote',
  salaryMinUsd: 3000,
};

const job: ScorableJob = {
  title: 'Senior Full Stack Engineer',
  descriptionText: 'We use React, Node.js and PostgreSQL. Good benefits.',
  tags: [],
  remoteType: 'remote',
  seniority: 'senior',
  location: null,
  salaryMinUsd: 3500,
  salaryMaxUsd: 5000,
};

describe('scoreJob', () => {
  it('scores a strong match', () => {
    const r = scoreJob(profile, job)!;
    expect(r.hidden).toBe(false);
    expect(r.breakdown.role).toBe(25);
    expect(r.breakdown.matchedSkills).toEqual(['React', 'Node.js', 'PostgreSQL']);
    expect(r.breakdown.skills).toBe(26);
    expect(r.breakdown.seniority).toBe(15);
    expect(r.breakdown.location).toBe(15);
    expect(r.breakdown.salary).toBe(10);
    expect(r.score).toBe(91);
  });

  it('does not match short skills inside other words', () => {
    const r = scoreJob(profile, job)!;
    expect(r.breakdown.matchedSkills).not.toContain('Go');
  });

  it('returns null when nothing relevant is found', () => {
    expect(scoreJob(profile, { ...job, title: 'Accountant', descriptionText: 'Excel and taxes' })).toBeNull();
  });

  it('hides jobs with exclude keywords', () => {
    const r = scoreJob(profile, { ...job, descriptionText: `${job.descriptionText} Gambling product.` })!;
    expect(r.hidden).toBe(true);
    expect(r.breakdown.excludedBy).toBe('gambling');
  });

  it('gives partial points for unknown values', () => {
    const r = scoreJob(profile, { ...job, seniority: null, remoteType: 'unknown', salaryMinUsd: null, salaryMaxUsd: null })!;
    expect(r.breakdown.seniority).toBe(8);
    expect(r.breakdown.location).toBe(8);
    expect(r.breakdown.salary).toBe(5);
  });

  it('penalizes office jobs for remote-only profiles and low salary', () => {
    const r = scoreJob(profile, { ...job, remoteType: 'office', salaryMinUsd: 1000, salaryMaxUsd: 1500 })!;
    expect(r.breakdown.location).toBe(0);
    expect(r.breakdown.salary).toBe(0);
  });

  it('gives half role points when keyword only in description', () => {
    const r = scoreJob(profile, { ...job, title: 'Software Engineer', descriptionText: 'Full stack role with React' })!;
    expect(r.breakdown.role).toBe(12);
  });
});
```

Run: `pnpm --filter @jp/core test score`
Expected: FAIL — `Failed to resolve import "./score"`.

- [ ] **Step 2: Реализация**

`packages/core/src/jobs/score.ts`:
```ts
import type { RemoteType, Seniority } from './job';
import { SENIORITIES } from './job';
import { regionBucket } from './normalize';
import type { SearchProfile } from './search';

export type ScorableJob = {
  title: string;
  descriptionText: string;
  tags: string[];
  remoteType: RemoteType;
  seniority: Seniority | null;
  location: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  skills?: string[];
};

export type MatchBreakdown = {
  skills: number;
  role: number;
  seniority: number;
  location: number;
  salary: number;
  matchedSkills: string[];
  excludedBy: string | null;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(haystack: string, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}+#])${escapeRegex(t)}($|[^\\p{L}\\p{N}+#])`, 'iu').test(haystack);
}

function seniorityPoints(wanted: Seniority[], actual: Seniority | null): number {
  if (wanted.length === 0) return 15;
  if (actual === null) return 8;
  if (wanted.includes(actual)) return 15;
  const idx = SENIORITIES.indexOf(actual);
  return wanted.some((w) => Math.abs(SENIORITIES.indexOf(w) - idx) === 1) ? 8 : 0;
}

function locationPoints(profile: SearchProfile, job: ScorableJob): number {
  if (profile.remoteType === 'any') return 15;
  if (job.remoteType === 'unknown') return 8;
  if (profile.remoteType === 'remote') {
    return job.remoteType === 'remote' ? 15 : job.remoteType === 'hybrid' ? 5 : 0;
  }
  if (job.remoteType === 'remote') return 10;
  if (profile.locations.length === 0) return 15;
  const jobBucket = regionBucket(job.location, job.remoteType);
  return profile.locations.some((l) => regionBucket(l, 'office') === jobBucket) ? 15 : 0;
}

function salaryPoints(min: number | null, job: ScorableJob): number {
  if (min === null) return 10;
  const best = job.salaryMaxUsd ?? job.salaryMinUsd;
  if (best === null) return 5;
  return best >= min ? 10 : 0;
}

export function scoreJob(
  profile: SearchProfile,
  job: ScorableJob,
): { score: number; hidden: boolean; breakdown: MatchBreakdown } | null {
  const title = job.title.toLowerCase();
  const text = `${title}\n${job.tags.join(' ').toLowerCase()}\n${job.descriptionText.toLowerCase()}`;

  const inTitle = profile.keywords.some((k) => containsTerm(title, k));
  const inText = inTitle || profile.keywords.some((k) => containsTerm(text, k));
  const jobSkills = (job.skills ?? []).map((s) => s.toLowerCase());
  const matchedSkills = profile.skills.filter(
    (s) => jobSkills.includes(s.toLowerCase()) || containsTerm(text, s),
  );

  if (!inText && matchedSkills.length === 0) return null;

  const role = inTitle ? 25 : inText ? 12 : 0;
  const skills =
    profile.skills.length === 0 ? (inText ? 35 : 0) : Math.round((35 * matchedSkills.length) / profile.skills.length);
  const breakdown: MatchBreakdown = {
    skills,
    role,
    seniority: seniorityPoints(profile.seniority, job.seniority),
    location: locationPoints(profile, job),
    salary: salaryPoints(profile.salaryMinUsd, job),
    matchedSkills,
    excludedBy: profile.excludeKeywords.find((e) => containsTerm(text, e))?.toLowerCase() ?? null,
  };
  const score = Math.min(
    100,
    breakdown.skills + breakdown.role + breakdown.seniority + breakdown.location + breakdown.salary,
  );
  return { score, hidden: breakdown.excludedBy !== null, breakdown };
}
```

`packages/core/src/index.ts` — добавить `export * from './jobs/score';`

- [ ] **Step 3: Тесты проходят**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS (`26 = round(35*3/4)`, `91 = 26+25+15+15+10`).

- [ ] **Step 4: Commit**

```bash
git add packages/core
git commit -m "feat(core): add keyword-based job match scoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `packages/scrapers` — HTTP-контекст, RSS, JSON-LD, фикстуры

**Files:**
- Create: `packages/scrapers/package.json`, `packages/scrapers/tsconfig.json`, `packages/scrapers/src/index.ts`, `packages/scrapers/src/types.ts`, `packages/scrapers/src/http.ts`, `packages/scrapers/src/rss.ts`, `packages/scrapers/src/jsonld.ts`, `packages/scrapers/scripts/capture-fixtures.mjs`, `packages/scrapers/fixtures/*`
- Test: `packages/scrapers/test/http.test.ts`, `packages/scrapers/test/parsers.test.ts`

**Interfaces:**
- Consumes: `RawJob`, `SourceId` из `@jp/core`.
- Produces:
  - `interface AdapterContext { fetchText(url: string, init?: RequestInit): Promise<string>; fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>; env: Record<string, string | undefined> }`
  - `interface SourceAdapter { id: SourceId; isConfigured?(env: Record<string, string | undefined>): boolean; search(params: Record<string, string>, ctx: AdapterContext): Promise<RawJob[]> }`
  - `class SourceBlockedError extends Error { status: number }`
  - `createHttpContext(opts: { userAgent: string; timeoutMs?: number; retries?: number; minDelayMs?: number; maxDelayMs?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number }, env?: Record<string, string | undefined>): AdapterContext`
  - `parseRss(xml: string): RssItem[]`, `type RssItem = { title: string; link: string; guid: string; description: string; pubDate: string | null; category: string | null; region: string | null; type: string | null }`
  - `extractJobPostings(html: string): JobPostingLd[]`, `type JobPostingLd` (см. код), `ldLocation(p: JobPostingLd): string | null`
  - `DEFAULT_USER_AGENT`

- [ ] **Step 1: Пакет и зависимости**

`packages/scrapers/package.json`:
```json
{
  "name": "@jp/scrapers",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "fixtures": "node scripts/capture-fixtures.mjs"
  },
  "dependencies": { "@jp/core": "workspace:*", "fast-xml-parser": "^5.2.0" },
  "devDependencies": { "typescript": "6.0.3", "vitest": "^5.0.3" }
}
```
Перед установкой проверить актуальную мажорную версию: `npm view fast-xml-parser version` — использовать её (`^<major>.<minor>.0`).

`packages/scrapers/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM"], "types": [] },
  "include": ["src", "test"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Захват фикстур**

`packages/scrapers/scripts/capture-fixtures.mjs`:
```js
// Fetches live samples from every source and trims them to 3 jobs.
// Re-run when a source changes its markup; also serves as a manual canary.
import { mkdir, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const dir = new URL('../fixtures/', import.meta.url);
await mkdir(dir, { recursive: true });

const get = async (url) => {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
};
const trimRss = (xml) => {
  const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].slice(0, 3).map((m) => m[0]);
  return xml.replace(/<item>[\s\S]*<\/item>/, items.join('\n'));
};
const trimLdHtml = (html) => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const list = JSON.parse(m[1]).filter((x) => x['@type'] === 'JobPosting').slice(0, 3);
  return `<html><body><script type="application/ld+json">${JSON.stringify(list)}</script></body></html>`;
};

const tasks = {
  'dou.xml': async () => trimRss(await get('https://jobs.dou.ua/vacancies/feeds/?search=react')),
  'djinni.html': async () => trimLdHtml(await get('https://djinni.co/jobs/?primary_keyword=JavaScript')),
  'wwr.xml': async () => trimRss(await get('https://weworkremotely.com/remote-jobs.rss')),
  'remoteok.json': async () => JSON.stringify(JSON.parse(await get('https://remoteok.com/api?tag=react')).slice(0, 4), null, 1),
  'remotive.json': async () => {
    const d = JSON.parse(await get('https://remotive.com/api/remote-jobs?search=react&limit=3'));
    return JSON.stringify({ ...d, jobs: d.jobs.slice(0, 3) }, null, 1);
  },
  'himalayas.json': async () => {
    const d = JSON.parse(await get('https://himalayas.app/jobs/api/search?q=react&limit=3'));
    return JSON.stringify({ ...d, jobs: d.jobs.slice(0, 3) }, null, 1);
  },
  'robotaua.json': async () => {
    const d = JSON.parse(await get('https://api.rabota.ua/vacancy/search?keyWords=react&count=3'));
    return JSON.stringify({ ...d, documents: d.documents.slice(0, 3) }, null, 1);
  },
  'hn-search.json': async () => get('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5'),
  'hn-item.json': async () => {
    const search = JSON.parse(await get('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5'));
    const hit = search.hits.find((h) => h.title.startsWith('Ask HN: Who is hiring?'));
    const item = JSON.parse(await get(`https://hn.algolia.com/api/v1/items/${hit.objectID}`));
    return JSON.stringify({ ...item, children: item.children.filter((c) => c.text).slice(0, 3) }, null, 1);
  },
};

for (const [file, run] of Object.entries(tasks)) {
  try {
    await writeFile(new URL(file, dir), await run());
    console.log('✓', file);
  } catch (err) {
    console.error('✗', file, err.message);
    process.exitCode = 1;
  }
}
```

Run: `pnpm --filter @jp/scrapers fixtures`
Expected: `✓` для всех 9 файлов. (Фикстура Jooble создаётся вручную в Task 10 — API требует ключ.)

- [ ] **Step 3: Падающие тесты**

`packages/scrapers/test/http.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { createHttpContext } from '../src/http';
import { SourceBlockedError } from '../src/types';

const sleep = vi.fn(async () => {});

function fakeFetch(...responses: (Response | Error)[]) {
  return vi.fn(async () => {
    const next = responses.shift();
    if (!next) throw new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  });
}

describe('createHttpContext', () => {
  it('sends the user agent and returns text', async () => {
    const fetchImpl = fakeFetch(new Response('ok'));
    const ctx = createHttpContext({ userAgent: 'UA/1', fetchImpl, sleep });
    expect(await ctx.fetchText('https://a.test/')).toBe('ok');
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect(new Headers(init.headers).get('user-agent')).toBe('UA/1');
  });

  it('waits between consecutive requests', async () => {
    sleep.mockClear();
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(new Response('1'), new Response('2')), sleep, random: () => 0.5, minDelayMs: 1000, maxDelayMs: 3000 });
    await ctx.fetchText('https://a.test/1');
    await ctx.fetchText('https://a.test/2');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('retries 5xx and network errors, then succeeds', async () => {
    const fetchImpl = fakeFetch(new Response('', { status: 502 }), new Error('ECONNRESET'), new Response('{"a":1}'));
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl, sleep, retries: 2 });
    expect(await ctx.fetchJson('https://a.test/')).toEqual({ a: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws SourceBlockedError on 403 and 429 without retrying', async () => {
    const fetchImpl = fakeFetch(new Response('', { status: 429 }));
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl, sleep });
    await expect(ctx.fetchText('https://a.test/')).rejects.toBeInstanceOf(SourceBlockedError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws on other client errors', async () => {
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(new Response('', { status: 404 })), sleep });
    await expect(ctx.fetchText('https://a.test/x')).rejects.toThrow('HTTP 404');
  });
});
```

`packages/scrapers/test/parsers.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractJobPostings, ldLocation } from '../src/jsonld';
import { parseRss } from '../src/rss';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('parseRss', () => {
  it('parses DOU items with decoded HTML descriptions', () => {
    const items = parseRss(fixture('dou.xml'));
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.link).toMatch(/^https:\/\/jobs\.dou\.ua\//);
      expect(item.description).toMatch(/<\w+/);
      expect(item.pubDate).not.toBeNull();
    }
  });

  it('parses WWR extra fields', () => {
    const items = parseRss(fixture('wwr.xml'));
    expect(items).toHaveLength(3);
    expect(items.some((i) => i.region !== null)).toBe(true);
  });

  it('handles a feed with a single item and no items', () => {
    const one = '<rss><channel><item><title>A</title><link>https://x.test/1</link></item></channel></rss>';
    expect(parseRss(one)).toHaveLength(1);
    expect(parseRss('<rss><channel></channel></rss>')).toEqual([]);
  });
});

describe('extractJobPostings', () => {
  it('reads Djinni JSON-LD job postings', () => {
    const postings = extractJobPostings(fixture('djinni.html'));
    expect(postings).toHaveLength(3);
    expect(postings[0]!.hiringOrganization?.name).toBeTruthy();
    expect(postings[0]!.url).toMatch(/^https:\/\/djinni\.co\/jobs\//);
  });

  it('ignores malformed blocks and non-job types', () => {
    const html =
      '<script type="application/ld+json">{bad json</script>' +
      '<script type="application/ld+json">{"@type":"Organization"}</script>';
    expect(extractJobPostings(html)).toEqual([]);
  });

  it('builds a location string', () => {
    expect(
      ldLocation({ applicantLocationRequirements: { address: { addressLocality: null, addressRegion: 'Europe' } } }),
    ).toBe('Europe');
    expect(ldLocation({})).toBeNull();
  });
});
```

Run: `pnpm --filter @jp/scrapers test`
Expected: FAIL — `Failed to resolve import "../src/http"` и т.д.

- [ ] **Step 4: Реализация**

`packages/scrapers/src/types.ts`:
```ts
import type { RawJob, SourceId } from '@jp/core';

export interface AdapterContext {
  fetchText(url: string, init?: RequestInit): Promise<string>;
  fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T>;
  env: Record<string, string | undefined>;
}

export interface SourceAdapter {
  id: SourceId;
  /** Sources that need credentials report false when they are missing; the pipeline then skips them. */
  isConfigured?(env: Record<string, string | undefined>): boolean;
  search(params: Record<string, string>, ctx: AdapterContext): Promise<RawJob[]>;
}

export class SourceBlockedError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`Blocked by source (HTTP ${status}) at ${url}`);
    this.name = 'SourceBlockedError';
  }
}
```

`packages/scrapers/src/http.ts`:
```ts
import { type AdapterContext, SourceBlockedError } from './types';

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

export type HttpOptions = {
  userAgent: string;
  timeoutMs?: number;
  retries?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export function createHttpContext(
  opts: HttpOptions,
  env: Record<string, string | undefined> = {},
): AdapterContext {
  const { userAgent, timeoutMs = 20_000, retries = 2, minDelayMs = 1_000, maxDelayMs = 4_000 } = opts;
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  let requests = 0;

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    if (requests++ > 0) await sleep(minDelayMs + Math.round(random() * (maxDelayMs - minDelayMs)));
    const headers = new Headers(init.headers);
    if (!headers.has('user-agent')) headers.set('user-agent', userAgent);

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
      } catch (err) {
        if (attempt < retries) {
          await sleep(1000 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      if (res.status === 403 || res.status === 429) throw new SourceBlockedError(res.status, url);
      if (res.status >= 500 && attempt < retries) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res;
    }
  }

  return {
    env,
    fetchText: async (url, init) => (await request(url, init)).text(),
    fetchJson: async <T>(url: string, init?: RequestInit) => (await (await request(url, init)).json()) as T,
  };
}
```

`packages/scrapers/src/rss.ts`:
```ts
import { XMLParser } from 'fast-xml-parser';

export type RssItem = {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate: string | null;
  category: string | null;
  region: string | null;
  type: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

function text(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object' && '#text' in value) return String((value as { '#text': unknown })['#text']);
  return String(value);
}

export function parseRss(xml: string): RssItem[] {
  const doc = parser.parse(xml) as { rss?: { channel?: { item?: unknown } } };
  const raw = doc.rss?.channel?.item;
  const items = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
  return items.map((entry) => {
    const i = entry as Record<string, unknown>;
    return {
      title: text(i.title),
      link: text(i.link),
      guid: text(i.guid) || text(i.link),
      description: text(i.description),
      pubDate: text(i.pubDate) || null,
      category: text(i.category) || null,
      region: text(i.region) || null,
      type: text(i.type) || null,
    };
  });
}
```

`packages/scrapers/src/jsonld.ts`:
```ts
type LdAddress = {
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressCountry?: string | { name?: string } | null;
};

export type JobPostingLd = {
  '@type'?: string;
  title?: string;
  url?: string;
  identifier?: string | number | { value?: string | number };
  description?: string;
  datePosted?: string;
  hiringOrganization?: { name?: string };
  jobLocationType?: string;
  applicantLocationRequirements?: { address?: LdAddress; name?: string };
  jobLocation?: { address?: LdAddress } | { address?: LdAddress }[];
  employmentType?: string | string[];
};

export function extractJobPostings(html: string): JobPostingLd[] {
  const out: JobPostingLd[] = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    for (const node of Array.isArray(data) ? data : [data]) {
      if (node && typeof node === 'object' && (node as JobPostingLd)['@type'] === 'JobPosting') {
        out.push(node as JobPostingLd);
      }
    }
  }
  return out;
}

function addressText(a: LdAddress | undefined): string | null {
  if (!a) return null;
  const country = typeof a.addressCountry === 'object' ? a.addressCountry?.name : a.addressCountry;
  return a.addressLocality || a.addressRegion || country || null;
}

export function ldLocation(p: JobPostingLd): string | null {
  const jobLoc = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation;
  return (
    addressText(jobLoc?.address) ??
    addressText(p.applicantLocationRequirements?.address) ??
    p.applicantLocationRequirements?.name ??
    null
  );
}
```

`packages/scrapers/src/index.ts`:
```ts
export * from './types';
export * from './http';
export * from './rss';
export * from './jsonld';
```

- [ ] **Step 5: Тесты проходят**

Run: `pnpm --filter @jp/scrapers test && pnpm --filter @jp/scrapers typecheck`
Expected: PASS. Если `fast-xml-parser` новой мажорной версии переименовал опции `processEntities`/`htmlEntities` — свериться с его `README` в `node_modules` и поправить, сохранив поведение (описание HTML раскодировано).

- [ ] **Step 6: Commit**

```bash
git add packages/scrapers pnpm-lock.yaml
git commit -m "feat(scrapers): add http context, RSS and JSON-LD parsers with live fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Адаптеры DOU, Djinni, We Work Remotely

**Files:**
- Create: `packages/scrapers/src/adapters/dou.ts`, `packages/scrapers/src/adapters/djinni.ts`, `packages/scrapers/src/adapters/wwr.ts`
- Test: `packages/scrapers/test/adapters-feeds.test.ts`, `packages/scrapers/test/fake-context.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces: `douAdapter`, `djinniAdapter`, `wwrAdapter: SourceAdapter`; `splitDouTitle(full: string): { title: string; company: string; location: string | null }`; `fakeContext(routes: Record<string, string | object>): AdapterContext` (тестовый, по подстроке URL).

- [ ] **Step 1: Тестовый контекст и падающие тесты**

`packages/scrapers/test/fake-context.ts`:
```ts
import type { AdapterContext } from '../src/types';

/** Returns the body of the first route whose key is a substring of the requested URL. */
export function fakeContext(routes: Record<string, string | object>, env: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const find = (url: string) => {
    calls.push({ url });
    const key = Object.keys(routes).find((k) => url.includes(k));
    if (key === undefined) throw new Error(`No fake route for ${url}`);
    return routes[key]!;
  };
  const ctx: AdapterContext = {
    env,
    fetchText: async (url) => {
      const body = find(url);
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
    fetchJson: async <T>(url: string, init?: RequestInit) => {
      const body = find(url);
      calls[calls.length - 1]!.init = init;
      return (typeof body === 'string' ? JSON.parse(body) : body) as T;
    },
  };
  return { ctx, calls };
}
```

`packages/scrapers/test/adapters-feeds.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { djinniAdapter } from '../src/adapters/djinni';
import { douAdapter, splitDouTitle } from '../src/adapters/dou';
import { wwrAdapter } from '../src/adapters/wwr';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

async function expectNormalizable(jobs: Awaited<ReturnType<typeof douAdapter.search>>) {
  expect(jobs.length).toBeGreaterThan(0);
  for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
}

describe('splitDouTitle', () => {
  it('splits role, company and locations', () => {
    expect(splitDouTitle('Front-end Developer (React + TypeScript) в "ІНФОТЕХ", Київ, віддалено')).toEqual({
      title: 'Front-end Developer (React + TypeScript)',
      company: 'ІНФОТЕХ',
      location: 'Київ, віддалено',
    });
    expect(splitDouTitle('QA в Acme')).toEqual({ title: 'QA', company: 'Acme', location: null });
  });
});

describe('douAdapter', () => {
  it('builds the feed URL and maps items', async () => {
    const { ctx, calls } = fakeContext({ 'jobs.dou.ua/vacancies/feeds': fixture('dou.xml') });
    const jobs = await douAdapter.search({ search: 'react developer' }, ctx);
    expect(calls[0]!.url).toBe('https://jobs.dou.ua/vacancies/feeds/?search=react%20developer');
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.externalId).toMatch(/^\d+$/);
    expect(jobs[0]!.url).not.toContain('utm_source');
    await expectNormalizable(jobs);
  });
});

describe('djinniAdapter', () => {
  it('reads JSON-LD from listing pages and stops when a page is empty', async () => {
    const { ctx, calls } = fakeContext({ 'page=2': '<html></html>', 'djinni.co/jobs/': fixture('djinni.html') });
    const jobs = await djinniAdapter.search({ primary_keyword: 'JavaScript' }, ctx);
    expect(calls.map((c) => c.url)).toEqual([
      'https://djinni.co/jobs/?primary_keyword=JavaScript',
      'https://djinni.co/jobs/?primary_keyword=JavaScript&page=2',
    ]);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.company).not.toBe('');
    await expectNormalizable(jobs);
  });
});

describe('wwrAdapter', () => {
  it('splits "Company: Role" titles and marks jobs remote', async () => {
    const { ctx } = fakeContext({ 'weworkremotely.com': fixture('wwr.xml') });
    const jobs = await wwrAdapter.search({}, ctx);
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.company.length > 0 && !j.title.startsWith(`${j.company}:`))).toBe(true);
    expect(jobs.every((j) => j.remoteHint === 'remote')).toBe(true);
    await expectNormalizable(jobs);
  });
});
```

Run: `pnpm --filter @jp/scrapers test adapters-feeds`
Expected: FAIL — `Failed to resolve import "../src/adapters/djinni"`.

- [ ] **Step 2: Реализация**

`packages/scrapers/src/adapters/dou.ts`:
```ts
import type { RawJob } from '@jp/core';
import { parseRss } from '../rss';
import type { SourceAdapter } from '../types';

const FEED = 'https://jobs.dou.ua/vacancies/feeds/';

export function splitDouTitle(full: string): { title: string; company: string; location: string | null } {
  const at = full.lastIndexOf(' в ');
  if (at < 0) return { title: full.trim(), company: 'DOU', location: null };
  const title = full.slice(0, at).trim();
  const rest = full.slice(at + 3).trim();
  const comma = rest.indexOf(', ');
  const company = (comma < 0 ? rest : rest.slice(0, comma)).replace(/^["«“]+|["»”]+$/g, '').trim();
  const location = comma < 0 ? null : rest.slice(comma + 2).trim() || null;
  return { title, company, location };
}

export const douAdapter: SourceAdapter = {
  id: 'dou',
  async search(params, ctx) {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.category) qs.set('category', params.category);
    const url = `${FEED}${qs.size ? `?${qs.toString().replace(/\+/g, '%20')}` : ''}`;
    const items = parseRss(await ctx.fetchText(url));
    return items.flatMap((item): RawJob[] => {
      const id = item.link.match(/vacancies\/(\d+)/)?.[1];
      if (!id) return [];
      const { title, company, location } = splitDouTitle(item.title);
      return [
        {
          externalId: id,
          url: item.link.split('?')[0]!,
          title,
          company,
          description: item.description,
          location,
          postedAt: item.pubDate,
          remoteHint: location?.includes('віддалено') ? 'remote' : undefined,
        },
      ];
    });
  },
};
```

`packages/scrapers/src/adapters/djinni.ts`:
```ts
import type { RawJob } from '@jp/core';
import { extractJobPostings, type JobPostingLd, ldLocation } from '../jsonld';
import type { SourceAdapter } from '../types';

const BASE = 'https://djinni.co/jobs/';
const MAX_PAGES = 2;

function toRawJob(p: JobPostingLd): RawJob | null {
  const id = typeof p.identifier === 'object' ? p.identifier?.value : p.identifier;
  if (!p.url || !p.title || id == null) return null;
  return {
    externalId: String(id),
    url: p.url,
    title: p.title,
    company: p.hiringOrganization?.name?.trim() || 'Djinni',
    description: p.description ?? '',
    location: ldLocation(p),
    postedAt: p.datePosted ?? null,
    remoteHint: p.jobLocationType === 'TELECOMMUTE' ? 'remote' : undefined,
  };
}

export const djinniAdapter: SourceAdapter = {
  id: 'djinni',
  async search(params, ctx) {
    const out: RawJob[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const qs = new URLSearchParams();
      if (params.primary_keyword) qs.set('primary_keyword', params.primary_keyword);
      if (page > 1) qs.set('page', String(page));
      const postings = extractJobPostings(await ctx.fetchText(`${BASE}${qs.size ? `?${qs}` : ''}`));
      if (postings.length === 0) break;
      for (const p of postings) {
        const job = toRawJob(p);
        if (job) out.push(job);
      }
    }
    return out;
  },
};
```

`packages/scrapers/src/adapters/wwr.ts`:
```ts
import type { RawJob } from '@jp/core';
import { parseRss } from '../rss';
import type { SourceAdapter } from '../types';

const FEED = 'https://weworkremotely.com/remote-jobs.rss';

export const wwrAdapter: SourceAdapter = {
  id: 'wwr',
  async search(_params, ctx) {
    return parseRss(await ctx.fetchText(FEED)).flatMap((item): RawJob[] => {
      const sep = item.title.indexOf(': ');
      if (sep < 0) return [];
      const slug = item.guid.split('/').filter(Boolean).pop();
      if (!slug) return [];
      return [
        {
          externalId: slug,
          url: item.link || item.guid,
          title: item.title.slice(sep + 2),
          company: item.title.slice(0, sep),
          description: item.description,
          location: item.region,
          postedAt: item.pubDate,
          remoteHint: 'remote',
          tags: [item.category, item.type].filter((t): t is string => Boolean(t)),
        },
      ];
    });
  },
};
```

- [ ] **Step 3: Тесты проходят**

Run: `pnpm --filter @jp/scrapers test && pnpm --filter @jp/scrapers typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/scrapers
git commit -m "feat(scrapers): add DOU, Djinni and We Work Remotely adapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Адаптеры RemoteOK, Remotive, Himalayas

**Files:**
- Create: `packages/scrapers/src/adapters/remoteok.ts`, `packages/scrapers/src/adapters/remotive.ts`, `packages/scrapers/src/adapters/himalayas.ts`
- Test: `packages/scrapers/test/adapters-remote.test.ts`

**Interfaces:**
- Produces: `remoteokAdapter`, `remotiveAdapter`, `himalayasAdapter: SourceAdapter`.

- [ ] **Step 1: Падающий тест**

`packages/scrapers/test/adapters-remote.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { himalayasAdapter } from '../src/adapters/himalayas';
import { remoteokAdapter } from '../src/adapters/remoteok';
import { remotiveAdapter } from '../src/adapters/remotive';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('remoteokAdapter', () => {
  it('skips the legal notice and maps jobs', async () => {
    const { ctx, calls } = fakeContext({ 'remoteok.com/api': fixture('remoteok.json') });
    const jobs = await remoteokAdapter.search({ tag: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://remoteok.com/api?tag=react');
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.remoteHint === 'remote')).toBe(true);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('remotiveAdapter', () => {
  it('maps jobs from the search API', async () => {
    const { ctx, calls } = fakeContext({ 'remotive.com/api': fixture('remotive.json') });
    const jobs = await remotiveAdapter.search({ search: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://remotive.com/api/remote-jobs?search=react&limit=50');
    expect(jobs).toHaveLength(3);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('himalayasAdapter', () => {
  it('maps jobs with annual salary and epoch dates', async () => {
    const { ctx, calls } = fakeContext({ 'himalayas.app/jobs/api/search': fixture('himalayas.json') });
    const jobs = await himalayasAdapter.search({ q: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://himalayas.app/jobs/api/search?q=react&limit=50');
    expect(jobs).toHaveLength(3);
    const normalized = await Promise.all(jobs.map(normalizeJob));
    expect(normalized.every(Boolean)).toBe(true);
    expect(normalized[0]!.postedAt?.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
  });
});
```

Run: `pnpm --filter @jp/scrapers test adapters-remote`
Expected: FAIL — missing modules.

- [ ] **Step 2: Реализация**

`packages/scrapers/src/adapters/remoteok.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type RemoteOkJob = {
  id?: string | number;
  position?: string;
  company?: string;
  description?: string;
  location?: string;
  url?: string;
  date?: string;
  tags?: string[];
  salary_min?: number;
  salary_max?: number;
};

export const remoteokAdapter: SourceAdapter = {
  id: 'remoteok',
  async search(params, ctx) {
    const url = params.tag ? `https://remoteok.com/api?tag=${encodeURIComponent(params.tag)}` : 'https://remoteok.com/api';
    const data = await ctx.fetchJson<RemoteOkJob[]>(url);
    return data.flatMap((j): RawJob[] => {
      if (j.id == null || !j.position || !j.company) return [];
      const hasSalary = (j.salary_min ?? 0) > 0;
      return [
        {
          externalId: String(j.id),
          url: j.url ?? `https://remoteok.com/remote-jobs/${j.id}`,
          title: j.position,
          company: j.company,
          description: j.description ?? '',
          location: j.location || null,
          salaryRaw: hasSalary ? `$${j.salary_min} - $${j.salary_max || j.salary_min}` : null,
          salaryPeriod: hasSalary ? 'year' : undefined,
          postedAt: j.date ?? null,
          remoteHint: 'remote',
          tags: j.tags ?? [],
        },
      ];
    });
  },
};
```

`packages/scrapers/src/adapters/remotive.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type RemotiveResponse = {
  jobs: {
    id: number;
    url: string;
    title: string;
    company_name: string;
    tags?: string[];
    job_type?: string;
    publication_date?: string;
    candidate_required_location?: string;
    salary?: string;
    description?: string;
  }[];
};

export const remotiveAdapter: SourceAdapter = {
  id: 'remotive',
  async search(params, ctx) {
    const qs = new URLSearchParams({ search: params.search ?? '', limit: '50' });
    const data = await ctx.fetchJson<RemotiveResponse>(`https://remotive.com/api/remote-jobs?${qs}`);
    return data.jobs.map(
      (j): RawJob => ({
        externalId: String(j.id),
        url: j.url,
        title: j.title,
        company: j.company_name,
        description: j.description ?? '',
        location: j.candidate_required_location || null,
        salaryRaw: j.salary || null,
        postedAt: j.publication_date ?? null,
        remoteHint: 'remote',
        tags: [...(j.tags ?? []), ...(j.job_type ? [j.job_type] : [])],
      }),
    );
  },
};
```

`packages/scrapers/src/adapters/himalayas.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type HimalayasResponse = {
  jobs: {
    title: string;
    companyName: string;
    description?: string;
    excerpt?: string;
    minSalary?: number | null;
    maxSalary?: number | null;
    currency?: string | null;
    salaryPeriod?: string | null;
    seniority?: string[];
    locationRestrictions?: string[];
    pubDate?: number;
    applicationLink?: string;
    guid: string;
    categories?: string[];
  }[];
};

export const himalayasAdapter: SourceAdapter = {
  id: 'himalayas',
  async search(params, ctx) {
    const qs = new URLSearchParams({ q: params.q ?? '', limit: '50' });
    const data = await ctx.fetchJson<HimalayasResponse>(`https://himalayas.app/jobs/api/search?${qs}`);
    return data.jobs.map((j): RawJob => {
      const hasSalary = (j.minSalary ?? 0) > 0;
      return {
        externalId: j.guid,
        url: j.guid,
        title: j.title,
        company: j.companyName,
        description: j.description ?? j.excerpt ?? '',
        location: j.locationRestrictions?.join(', ') || null,
        salaryRaw: hasSalary ? `${j.minSalary} - ${j.maxSalary ?? j.minSalary} ${j.currency ?? 'USD'}` : null,
        salaryPeriod: hasSalary ? (j.salaryPeriod === 'monthly' ? 'month' : 'year') : undefined,
        postedAt: j.pubDate ?? null,
        remoteHint: 'remote',
        tags: [...(j.categories ?? []), ...(j.seniority ?? [])],
      };
    });
  },
};
```

- [ ] **Step 3: Тесты проходят**

Run: `pnpm --filter @jp/scrapers test && pnpm --filter @jp/scrapers typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/scrapers
git commit -m "feat(scrapers): add RemoteOK, Remotive and Himalayas adapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Адаптеры robota.ua, Jooble, HN Who's Hiring + реестр адаптеров

**Files:**
- Create: `packages/scrapers/src/adapters/robotaua.ts`, `packages/scrapers/src/adapters/jooble.ts`, `packages/scrapers/src/adapters/hn.ts`, `packages/scrapers/src/adapters/index.ts`, `packages/scrapers/fixtures/jooble.json`
- Modify: `packages/scrapers/src/index.ts`
- Test: `packages/scrapers/test/adapters-misc.test.ts`

**Interfaces:**
- Produces: `robotauaAdapter`, `joobleAdapter` (`isConfigured(env) = Boolean(env.JOOBLE_API_KEY)`), `hnAdapter`, `parseHnFirstLine(line: string): { company: string; title: string; location: string | null }`, `ADAPTERS: Record<SourceId, SourceAdapter>`.

- [ ] **Step 1: Фикстура Jooble (по документации API, ключ не нужен)**

`packages/scrapers/fixtures/jooble.json`:
```json
{
  "totalCount": 2,
  "jobs": [
    {
      "title": "Senior React Developer",
      "location": "Kyiv",
      "snippet": "&nbsp;...We are looking for a <b>React</b> developer, remote possible...&nbsp;",
      "salary": "$3000 - $4000",
      "source": "example.com",
      "type": "Full-time",
      "link": "https://jooble.org/desc/-111111111111111111",
      "company": "Acme",
      "updated": "2026-10-01T10:00:00.0000000",
      "id": -111111111111111111
    },
    {
      "title": "Full Stack Engineer (Node.js)",
      "location": "Remote",
      "snippet": "Node.js, PostgreSQL",
      "salary": "",
      "source": "example.org",
      "type": "",
      "link": "https://jooble.org/desc/222222222222222222",
      "company": "",
      "updated": "2026-09-30T08:00:00.0000000",
      "id": 222222222222222222
    }
  ]
}
```

- [ ] **Step 2: Падающий тест**

`packages/scrapers/test/adapters-misc.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { normalizeJob, SOURCE_IDS } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../src/adapters';
import { hnAdapter, parseHnFirstLine } from '../src/adapters/hn';
import { joobleAdapter } from '../src/adapters/jooble';
import { robotauaAdapter } from '../src/adapters/robotaua';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('robotauaAdapter', () => {
  it('maps documents to robota.ua vacancy URLs', async () => {
    const { ctx, calls } = fakeContext({ 'api.rabota.ua': fixture('robotaua.json') });
    const jobs = await robotauaAdapter.search({ keyWords: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://api.rabota.ua/vacancy/search?keyWords=react&count=40&page=0');
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/robota\.ua\/company\d+\/vacancy\d+$/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('joobleAdapter', () => {
  it('is configured only with an API key', () => {
    expect(joobleAdapter.isConfigured!({})).toBe(false);
    expect(joobleAdapter.isConfigured!({ JOOBLE_API_KEY: 'k' })).toBe(true);
  });
  it('POSTs keywords and maps jobs, defaulting a missing company', async () => {
    const { ctx, calls } = fakeContext({ 'jooble.org/api/k': fixture('jooble.json') }, { JOOBLE_API_KEY: 'k' });
    const jobs = await joobleAdapter.search({ keywords: 'react' }, ctx);
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ keywords: 'react', location: '', page: '1' });
    expect(jobs).toHaveLength(2);
    expect(jobs[1]!.company).toBe('example.org');
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('parseHnFirstLine', () => {
  it('splits pipe and dash separated headers', () => {
    expect(parseHnFirstLine('Acme | Senior Backend Engineer | Remote (US) | $150k')).toEqual({
      company: 'Acme',
      title: 'Senior Backend Engineer',
      location: 'Remote (US)',
    });
    expect(parseHnFirstLine('PrairieLearn (Remote US) — Full-Stack Software Engineer — TypeScript')).toEqual({
      company: 'PrairieLearn (Remote US)',
      title: 'Full-Stack Software Engineer',
      location: null,
    });
  });
});

describe('hnAdapter', () => {
  it('finds the latest hiring thread and maps top-level comments', async () => {
    const { ctx, calls } = fakeContext({
      'search_by_date': fixture('hn-search.json'),
      'api/v1/items/': fixture('hn-item.json'),
    });
    const jobs = await hnAdapter.search({}, ctx);
    expect(calls).toHaveLength(2);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('ADAPTERS', () => {
  it('has an adapter for every source id', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...SOURCE_IDS].sort());
  });
});
```

Run: `pnpm --filter @jp/scrapers test adapters-misc`
Expected: FAIL — missing modules.

- [ ] **Step 3: Реализация**

`packages/scrapers/src/adapters/robotaua.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type RabotaResponse = {
  documents: {
    id: number;
    name: string;
    companyName?: string;
    cityName?: string;
    date?: string;
    salary?: number;
    salaryFrom?: number;
    salaryTo?: number;
    shortDescription?: string;
    notebookId: number;
  }[];
};

function salaryRaw(d: RabotaResponse['documents'][number]): string | null {
  if (d.salaryFrom && d.salaryTo) return `${d.salaryFrom} - ${d.salaryTo} грн`;
  if (d.salaryFrom) return `від ${d.salaryFrom} грн`;
  if (d.salary) return `${d.salary} грн`;
  return null;
}

export const robotauaAdapter: SourceAdapter = {
  id: 'robotaua',
  async search(params, ctx) {
    const qs = new URLSearchParams({ keyWords: params.keyWords ?? '', count: '40', page: '0' });
    const data = await ctx.fetchJson<RabotaResponse>(`https://api.rabota.ua/vacancy/search?${qs}`);
    return data.documents.map(
      (d): RawJob => ({
        externalId: String(d.id),
        url: `https://robota.ua/company${d.notebookId}/vacancy${d.id}`,
        title: d.name,
        company: d.companyName?.trim() || 'robota.ua',
        description: d.shortDescription ?? '',
        location: d.cityName || null,
        salaryRaw: salaryRaw(d),
        salaryPeriod: 'month',
        postedAt: d.date ?? null,
      }),
    );
  },
};
```

`packages/scrapers/src/adapters/jooble.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type JoobleResponse = {
  jobs: {
    id: number | string;
    title: string;
    location?: string;
    snippet?: string;
    salary?: string;
    source?: string;
    type?: string;
    link: string;
    company?: string;
    updated?: string;
  }[];
};

export const joobleAdapter: SourceAdapter = {
  id: 'jooble',
  isConfigured: (env) => Boolean(env.JOOBLE_API_KEY),
  async search(params, ctx) {
    const key = ctx.env.JOOBLE_API_KEY;
    if (!key) return [];
    const data = await ctx.fetchJson<JoobleResponse>(`https://jooble.org/api/${key}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keywords: params.keywords ?? '', location: params.location ?? '', page: '1' }),
    });
    return data.jobs.map(
      (j): RawJob => ({
        externalId: String(j.id),
        url: j.link,
        title: j.title,
        company: j.company?.trim() || j.source || 'Jooble',
        description: j.snippet ?? '',
        location: j.location || null,
        salaryRaw: j.salary || null,
        postedAt: j.updated ?? null,
        tags: j.type ? [j.type] : [],
      }),
    );
  },
};
```

`packages/scrapers/src/adapters/hn.ts`:
```ts
import { htmlToText, type RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type HnSearch = { hits: { objectID: string; title: string }[] };
type HnItem = { children: { id: number; text: string | null; created_at: string }[] };

const ROLE = /engineer|developer|designer|manager|scientist|analyst|lead|devops|sre|architect|marketer|sales|recruiter|product|qa|tester/i;
const PLACE = /remote|onsite|on-site|hybrid/i;

export function parseHnFirstLine(line: string): { company: string; title: string; location: string | null } {
  const parts = line.split(/\s+[|—–]\s+|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  const company = parts[0] ?? 'Hacker News';
  const rest = parts.slice(1);
  const title = rest.find((p) => ROLE.test(p)) ?? rest[0] ?? 'Multiple roles';
  const location = rest.find((p) => p !== title && PLACE.test(p)) ?? null;
  return { company, title, location };
}

export const hnAdapter: SourceAdapter = {
  id: 'hn',
  async search(_params, ctx) {
    const search = await ctx.fetchJson<HnSearch>(
      'https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=5',
    );
    const thread = search.hits.find((h) => h.title.startsWith('Ask HN: Who is hiring?'));
    if (!thread) return [];
    const item = await ctx.fetchJson<HnItem>(`https://hn.algolia.com/api/v1/items/${thread.objectID}`);
    return item.children.slice(0, 300).flatMap((c): RawJob[] => {
      if (!c.text) return [];
      const text = htmlToText(c.text);
      const { company, title, location } = parseHnFirstLine(text.split('\n')[0] ?? '');
      return [
        {
          externalId: String(c.id),
          url: `https://news.ycombinator.com/item?id=${c.id}`,
          title,
          company,
          description: text,
          location,
          postedAt: c.created_at,
        },
      ];
    });
  },
};
```

`packages/scrapers/src/adapters/index.ts`:
```ts
import type { SourceId } from '@jp/core';
import type { SourceAdapter } from '../types';
import { djinniAdapter } from './djinni';
import { douAdapter } from './dou';
import { himalayasAdapter } from './himalayas';
import { hnAdapter } from './hn';
import { joobleAdapter } from './jooble';
import { remoteokAdapter } from './remoteok';
import { remotiveAdapter } from './remotive';
import { robotauaAdapter } from './robotaua';
import { wwrAdapter } from './wwr';

export const ADAPTERS: Record<SourceId, SourceAdapter> = {
  dou: douAdapter,
  djinni: djinniAdapter,
  robotaua: robotauaAdapter,
  jooble: joobleAdapter,
  remoteok: remoteokAdapter,
  remotive: remotiveAdapter,
  himalayas: himalayasAdapter,
  wwr: wwrAdapter,
  hn: hnAdapter,
};
```

`packages/scrapers/src/index.ts` — добавить `export * from './adapters';`

- [ ] **Step 4: Тесты проходят**

Run: `pnpm --filter @jp/scrapers test && pnpm --filter @jp/scrapers typecheck`
Expected: PASS. Если первая строка конкретного комментария HN в фикстуре не содержит роли и `normalizeJob` всё равно валиден — тест проходит (заголовок `rest[0]` или `Multiple roles`).

- [ ] **Step 5: Commit**

```bash
git add packages/scrapers
git commit -m "feat(scrapers): add robota.ua, Jooble and HN Who's Hiring adapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: `apps/jobs` — функции конвейера (репозиторий, матчинг, run-query, синхронизация, истечение) + интеграционные тесты

**Files:**
- Create: `apps/jobs/package.json`, `apps/jobs/tsconfig.json`, `apps/jobs/vitest.integration.config.ts`, `apps/jobs/.env.example`, `apps/jobs/src/env.ts`, `apps/jobs/src/db.ts`, `apps/jobs/src/pipeline/repository.ts`, `apps/jobs/src/pipeline/match.ts`, `apps/jobs/src/pipeline/run-query.ts`, `apps/jobs/src/pipeline/sync-profiles.ts`, `apps/jobs/src/pipeline/expire.ts`, `apps/jobs/test/pipeline.int.test.ts`
- Modify: `scripts/supabase-env.sh` (пишет также `apps/jobs/.env.local`)

**Interfaces:**
- Consumes: `@jp/core` (normalizeJob, scoreJob, buildSourceQueries, типы), `@jp/scrapers` (`SourceAdapter`, `AdapterContext`, `SourceBlockedError`), `@jp/db` (`Database`), `@jp/db/service` (`createServiceClient`).
- Produces:
  - `type Db = SupabaseClient<Database>`; `getDb(): Db` (`src/db.ts`)
  - `jobsEnv()` → `{ SUPABASE_URL; SUPABASE_SECRET_KEY; SCRAPER_USER_AGENT; JOOBLE_API_KEY? }`
  - repository: `getQuery`, `getSource`, `startRun`, `finishRun`, `updateSourceHealth(db, source, outcome: 'ok' | 'empty' | 'blocked', now): Promise<{ alert: string | null }>`, `markQueryRun`, `saveJob(db, sourceId, job, now): Promise<{ jobId: string; isNew: boolean }>`, `getActiveProfiles(db)`, `getProfile(db, id)`, `getProfilesForQuery(db, queryId)`, `getDueQueryIds(db, now, limit?)`, `getRecentJobs(db, since)`, `insertMatches(db, rows)`
  - `matchJobs(db, profiles: SearchProfile[], jobs: { jobId: string; job: ScorableJob }[]): Promise<number>` (`match.ts`)
  - `runQuery(deps: RunQueryDeps, queryId: string): Promise<RunQueryResult>`; `RunQueryDeps = { db: Db; adapters: Record<string, SourceAdapter>; createContext: (sourceId: string) => AdapterContext; env?: Record<string, string | undefined>; now?: () => Date }`; `RunQueryResult = { status: 'ok' | 'skipped' | 'blocked'; found: number; inserted: number; matched: number; alert: string | null }`
  - `syncProfile(db, profile: SearchProfile, now): Promise<{ queryIds: string[]; matched: number }>`, `syncAllProfiles(db, now)` (`sync-profiles.ts`)
  - `expireJobs(db, now, days = 14): Promise<number>` (`expire.ts`)

- [ ] **Step 1: Пакет, env, клиент**

`apps/jobs/package.json`:
```json
{
  "name": "@jp/jobs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "run-once": "tsx src/cli/run-once.ts",
    "dev": "trigger dev",
    "deploy": "trigger deploy"
  },
  "dependencies": {
    "@jp/core": "workspace:*",
    "@jp/db": "workspace:*",
    "@jp/scrapers": "workspace:*",
    "@supabase/supabase-js": "^2.117.2",
    "@trigger.dev/sdk": "4.6.4",
    "dotenv": "^18.0.0",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "trigger.dev": "4.6.4",
    "tsx": "^4.20.0",
    "typescript": "6.0.3",
    "vitest": "^5.0.3"
  }
}
```
Перед установкой проверить версии: `npm view tsx version`, `npm view dotenv version` (использовать актуальные мажорные).

`apps/jobs/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM"], "types": ["node"] },
  "include": ["src", "test", "trigger.config.ts", "*.config.ts"]
}
```
Run: `pnpm --filter @jp/jobs add -D @types/node` (если `types: ["node"]` не резолвится).

`apps/jobs/vitest.integration.config.ts`:
```ts
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '.env.local' });

export default defineConfig({
  test: { include: ['test/**/*.int.test.ts'], fileParallelism: false, testTimeout: 30_000 },
});
```

`apps/jobs/.env.example`:
```
# Written by `pnpm db:env` for local Supabase
SUPABASE_URL=
SUPABASE_SECRET_KEY=
# Trigger.dev (cloud.trigger.dev → project → API keys → DEV)
TRIGGER_PROJECT_REF=
TRIGGER_SECRET_KEY=
# Optional
JOOBLE_API_KEY=
SCRAPER_USER_AGENT=
```

`apps/jobs/src/env.ts`:
```ts
import { DEFAULT_USER_AGENT } from '@jp/scrapers';
import { z } from 'zod';

export function jobsEnv() {
  return z
    .object({
      SUPABASE_URL: z.url(),
      SUPABASE_SECRET_KEY: z.string().min(1),
      SCRAPER_USER_AGENT: z.string().min(1).default(DEFAULT_USER_AGENT),
      JOOBLE_API_KEY: z.string().min(1).optional(),
    })
    .parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      SCRAPER_USER_AGENT: process.env.SCRAPER_USER_AGENT || undefined,
      JOOBLE_API_KEY: process.env.JOOBLE_API_KEY || undefined,
    });
}
```

`apps/jobs/src/db.ts`:
```ts
import type { Database } from '@jp/db';
import { createServiceClient } from '@jp/db/service';
import type { SupabaseClient } from '@supabase/supabase-js';
import { jobsEnv } from './env';

export type Db = SupabaseClient<Database>;

let client: Db | undefined;

export function getDb(): Db {
  if (!client) {
    const env = jobsEnv();
    client = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
  }
  return client;
}
```

`scripts/supabase-env.sh` — после блока, пишущего `apps/web/.env.local`, добавить:
```bash
cat > apps/jobs/.env.local <<EOF
SUPABASE_URL=${API_URL}
SUPABASE_SECRET_KEY=${SECRET_KEY:-$SERVICE_ROLE_KEY}
EOF
echo "wrote apps/jobs/.env.local"
```
(Ключи Trigger.dev и Jooble пользователь дописывает в `apps/jobs/.env.local` вручную; скрипт перезаписывает файл — поэтому в Task 12 `run-once` и `trigger dev` дополнительно читают `apps/jobs/.env` для ручных ключей.) Чтобы ручные ключи не терялись, скрипт пишет только `.env.local`, а пользователь хранит `TRIGGER_*`/`JOOBLE_API_KEY` в `apps/jobs/.env` (gitignored через `.env*`).

Run: `pnpm install && pnpm db:env && cat apps/jobs/.env.local | cut -d= -f1`
Expected: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`.

- [ ] **Step 2: Падающий интеграционный тест**

`apps/jobs/test/pipeline.int.test.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { AdapterContext, SourceAdapter } from '@jp/scrapers';
import { SourceBlockedError } from '@jp/scrapers';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { expireJobs } from '../src/pipeline/expire';
import { getProfile } from '../src/pipeline/repository';
import { runQuery } from '../src/pipeline/run-query';
import { syncProfile } from '../src/pipeline/sync-profiles';

const db = getDb();
const now = new Date();
const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const rawJobs: RawJob[] = [
  {
    externalId: `a-${uniq}`,
    url: `https://jobs.dou.ua/vacancies/a-${uniq}/`,
    title: `Senior Full Stack Developer ${uniq}`,
    company: `Acme ${uniq}`,
    description: 'React, Node.js, PostgreSQL. Remote.',
    postedAt: now.toISOString(),
  },
  {
    externalId: `b-${uniq}`,
    url: `https://jobs.dou.ua/vacancies/b-${uniq}/`,
    title: `Accountant ${uniq}`,
    company: `Beta ${uniq}`,
    description: 'Excel and taxes',
  },
];

const fakeAdapter = (jobs: RawJob[] | Error): SourceAdapter => ({
  id: 'dou',
  search: async () => {
    if (jobs instanceof Error) throw jobs;
    return jobs;
  },
});
const ctx = {} as AdapterContext;

let userId: string;
let profileId: string;
let douQueryId: string;

beforeAll(async () => {
  const { data: user, error } = await db.auth.admin.createUser({ email: `pipe-${uniq}@e2e.test`, email_confirm: true });
  if (error) throw error;
  userId = user.user.id;
  const { data: sp, error: spError } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'Full stack', keywords: ['full stack'], skills: ['React', 'Node.js'], remote_type: 'remote' })
    .select('id')
    .single();
  if (spError) throw spError;
  profileId = sp.id;
  await db.from('sources').update({ paused_until: null, consecutive_empty_runs: 0, enabled: true }).eq('id', 'dou');
});

describe('syncProfile', () => {
  it('creates and links per-source queries for a profile', async () => {
    const profile = await getProfile(db, profileId);
    const { queryIds } = await syncProfile(db, profile!, now);
    expect(queryIds.length).toBeGreaterThan(5);
    const { data } = await db
      .from('search_queries')
      .select('id, source_id, params')
      .in('id', queryIds)
      .eq('source_id', 'dou');
    expect(data).toHaveLength(1);
    douQueryId = data![0]!.id;
  });
});

describe('runQuery', () => {
  it('saves relevant jobs, dedupes on re-run and creates matches', async () => {
    await db.from('search_queries').update({ next_run_at: now.toISOString() }).eq('id', douQueryId);
    const deps = { db, adapters: { dou: fakeAdapter(rawJobs) }, createContext: () => ctx, now: () => now };

    const first = await runQuery(deps, douQueryId);
    expect(first).toMatchObject({ status: 'ok', found: 2, inserted: 2 });
    expect(first.matched).toBeGreaterThanOrEqual(1); // other local test users may share this query

    const second = await runQuery(deps, douQueryId);
    expect(second).toMatchObject({ status: 'ok', found: 2, inserted: 0 });

    const { data: matches } = await db.from('job_matches').select('score, state, jobs(title)').eq('user_id', userId);
    expect(matches).toHaveLength(1);
    expect(matches![0]!.score).toBeGreaterThan(50);

    const { data: postings } = await db.from('job_postings').select('id').eq('external_id', `a-${uniq}`);
    expect(postings).toHaveLength(1);
  });

  it('dedupes the same job seen on another source by fingerprint', async () => {
    const { data: q } = await db
      .from('search_queries')
      .upsert({ source_id: 'remotive', query_key: `remotive:test-${uniq}`, params: {} }, { onConflict: 'query_key' })
      .select('id')
      .single();
    const remotive: SourceAdapter = { ...fakeAdapter([{ ...rawJobs[0]!, externalId: `r-${uniq}`, url: `https://remotive.com/x/${uniq}` }]), id: 'remotive' };
    const result = await runQuery({ db, adapters: { remotive }, createContext: () => ctx, now: () => now }, q!.id);
    expect(result.inserted).toBe(0);
    const { data: job } = await db.from('jobs').select('id, job_postings(source_id)').eq('title', rawJobs[0]!.title).single();
    expect(job!.job_postings.map((p) => p.source_id).sort()).toEqual(['dou', 'remotive']);
  });

  it('pauses the source when it blocks us', async () => {
    const deps = { db, adapters: { dou: fakeAdapter(new SourceBlockedError(429, 'https://x')) }, createContext: () => ctx, now: () => now };
    const result = await runQuery(deps, douQueryId);
    expect(result.status).toBe('blocked');
    const { data: source } = await db.from('sources').select('paused_until').eq('id', 'dou').single();
    expect(new Date(source!.paused_until!).getTime()).toBeGreaterThan(now.getTime());

    const skipped = await runQuery({ ...deps, adapters: { dou: fakeAdapter(rawJobs) } }, douQueryId);
    expect(skipped.status).toBe('skipped');
    await db.from('sources').update({ paused_until: null }).eq('id', 'dou');
  });

  it('raises an alert after three empty runs in a row', async () => {
    const deps = { db, adapters: { dou: fakeAdapter([]) }, createContext: () => ctx, now: () => now };
    const results = [await runQuery(deps, douQueryId), await runQuery(deps, douQueryId), await runQuery(deps, douQueryId)];
    expect(results.map((r) => r.alert !== null)).toEqual([false, false, true]);
    await db.from('sources').update({ consecutive_empty_runs: 0 }).eq('id', 'dou');
  });
});

describe('expireJobs', () => {
  it('expires jobs not seen for 14 days', async () => {
    const old = new Date(now.getTime() - 15 * 24 * 3600 * 1000).toISOString();
    await db.from('jobs').update({ last_seen_at: old }).eq('title', rawJobs[1]!.title);
    expect(await expireJobs(db, now)).toBeGreaterThanOrEqual(1);
    const { data } = await db.from('jobs').select('status').eq('title', rawJobs[1]!.title).single();
    expect(data!.status).toBe('expired');
  });
});
```

Run: `pnpm --filter @jp/jobs test:integration`
Expected: FAIL — `Failed to resolve import "../src/pipeline/expire"` и т.д.

- [ ] **Step 3: Репозиторий**

`apps/jobs/src/pipeline/repository.ts`:
```ts
import { type NormalizedJob, type ScorableJob, type SearchProfile, SENIORITIES, type Seniority } from '@jp/core';
import type { Json } from '@jp/db';
import type { Db } from '../db';

type ProfileRow = {
  id: string;
  user_id: string;
  keywords: string[];
  skills: string[];
  exclude_keywords: string[];
  seniority: string[];
  locations: string[];
  remote_type: string;
  salary_min_usd: number | null;
  is_active?: boolean;
};

const PROFILE_COLUMNS =
  'id, user_id, keywords, skills, exclude_keywords, seniority, locations, remote_type, salary_min_usd, is_active';

export function toSearchProfile(row: ProfileRow): SearchProfile {
  return {
    id: row.id,
    userId: row.user_id,
    keywords: row.keywords,
    skills: row.skills,
    excludeKeywords: row.exclude_keywords,
    seniority: row.seniority.filter((s): s is Seniority => (SENIORITIES as readonly string[]).includes(s)),
    locations: row.locations,
    remoteType: (['any', 'remote', 'hybrid', 'office'] as const).find((r) => r === row.remote_type) ?? 'any',
    salaryMinUsd: row.salary_min_usd,
  };
}

export async function getQuery(db: Db, id: string) {
  const { data, error } = await db.from('search_queries').select('id, source_id, params').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getSource(db: Db, id: string) {
  const { data, error } = await db
    .from('sources')
    .select('id, enabled, min_interval_minutes, paused_until, consecutive_empty_runs')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
export type SourceRow = Awaited<ReturnType<typeof getSource>>;

export async function startRun(db: Db, sourceId: string, queryId: string, now: Date): Promise<string> {
  const { data, error } = await db
    .from('source_runs')
    .insert({ source_id: sourceId, query_id: queryId, started_at: now.toISOString() })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function finishRun(
  db: Db,
  runId: string,
  patch: { status: 'ok' | 'error' | 'blocked'; found: number; inserted: number; error?: string },
) {
  const { error } = await db
    .from('source_runs')
    .update({ ...patch, error: patch.error ?? null, finished_at: new Date().toISOString() })
    .eq('id', runId);
  if (error) throw error;
}

export async function updateSourceHealth(
  db: Db,
  source: SourceRow,
  outcome: 'ok' | 'empty' | 'blocked',
  now: Date,
): Promise<{ alert: string | null }> {
  if (outcome === 'blocked') {
    const until = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    const { error } = await db.from('sources').update({ paused_until: until }).eq('id', source.id);
    if (error) throw error;
    return { alert: `Source ${source.id} blocked us; paused until ${until}` };
  }
  const empty = outcome === 'empty' ? source.consecutive_empty_runs + 1 : 0;
  const { error } = await db.from('sources').update({ consecutive_empty_runs: empty }).eq('id', source.id);
  if (error) throw error;
  return { alert: empty === 3 ? `Source ${source.id} returned 0 jobs 3 runs in a row — markup changed?` : null };
}

export async function markQueryRun(db: Db, queryId: string, now: Date, intervalMinutes: number) {
  const next = new Date(now.getTime() + Math.max(intervalMinutes, 15) * 60 * 1000);
  const { error } = await db
    .from('search_queries')
    .update({ last_run_at: now.toISOString(), next_run_at: next.toISOString() })
    .eq('id', queryId);
  if (error) throw error;
}

async function upsertCompany(db: Db, name: string, normalizedName: string): Promise<string> {
  const { data, error } = await db
    .from('companies')
    .upsert({ name, normalized_name: normalizedName }, { onConflict: 'normalized_name' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

async function findJobId(db: Db, job: NormalizedJob, companyId: string): Promise<string | null> {
  const { data: exact, error } = await db.from('jobs').select('id').eq('fingerprint', job.fingerprint).maybeSingle();
  if (error) throw error;
  if (exact) return exact.id;
  const { data: similar, error: rpcError } = await db.rpc('find_similar_job', {
    p_company_id: companyId,
    p_title: job.title,
  });
  if (rpcError) throw rpcError;
  return similar ?? null;
}

export async function saveJob(
  db: Db,
  sourceId: string,
  job: NormalizedJob,
  now: Date,
): Promise<{ jobId: string; isNew: boolean }> {
  const nowIso = now.toISOString();
  const { data: posting, error: postingError } = await db
    .from('job_postings')
    .select('job_id')
    .eq('source_id', sourceId)
    .eq('external_id', job.externalId)
    .maybeSingle();
  if (postingError) throw postingError;

  let jobId = posting?.job_id ?? null;
  let isNew = false;
  if (!jobId) {
    const companyId = await upsertCompany(db, job.company, job.companyNormalized);
    jobId = await findJobId(db, job, companyId);
    if (!jobId) {
      const { data, error } = await db
        .from('jobs')
        .insert({
          fingerprint: job.fingerprint,
          title: job.title,
          company_id: companyId,
          description_text: job.descriptionText,
          location: job.location,
          remote_type: job.remoteType,
          seniority: job.seniority,
          salary_raw: job.salaryRaw,
          salary_min_usd: job.salaryMinUsd,
          salary_max_usd: job.salaryMaxUsd,
          tags: job.tags,
          posted_at: job.postedAt?.toISOString() ?? null,
          first_seen_at: nowIso,
          last_seen_at: nowIso,
        })
        .select('id')
        .single();
      if (error?.code === '23505') {
        jobId = await findJobId(db, job, companyId);
        if (!jobId) throw error;
      } else if (error) {
        throw error;
      } else {
        jobId = data.id;
        isNew = true;
      }
    }
  }

  if (!isNew) {
    const { error } = await db.from('jobs').update({ last_seen_at: nowIso, status: 'active' }).eq('id', jobId);
    if (error) throw error;
  }
  const { error: upsertError } = await db
    .from('job_postings')
    .upsert(
      { job_id: jobId, source_id: sourceId, external_id: job.externalId, url: job.url, seen_at: nowIso },
      { onConflict: 'source_id,external_id' },
    );
  if (upsertError) throw upsertError;
  return { jobId, isNew };
}

export async function getActiveProfiles(db: Db): Promise<SearchProfile[]> {
  const { data, error } = await db.from('search_profiles').select(PROFILE_COLUMNS).eq('is_active', true);
  if (error) throw error;
  return data.map(toSearchProfile);
}

export async function getProfile(db: Db, id: string): Promise<(SearchProfile & { isActive: boolean }) | null> {
  const { data, error } = await db.from('search_profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? { ...toSearchProfile(data), isActive: data.is_active } : null;
}

export async function getProfilesForQuery(db: Db, queryId: string): Promise<SearchProfile[]> {
  const { data, error } = await db
    .from('search_profile_queries')
    .select(`search_profiles!inner(${PROFILE_COLUMNS})`)
    .eq('search_query_id', queryId)
    .eq('search_profiles.is_active', true);
  if (error) throw error;
  return data.map((row) => toSearchProfile(row.search_profiles as ProfileRow));
}

export async function getDueQueryIds(db: Db, now: Date, limit = 300): Promise<{ id: string; sourceId: string }[]> {
  const { data, error } = await db
    .from('search_queries')
    .select('id, source_id, search_profile_queries!inner(search_profile_id)')
    .lte('next_run_at', now.toISOString())
    .order('next_run_at')
    .limit(limit);
  if (error) throw error;
  return data.map((q) => ({ id: q.id, sourceId: q.source_id }));
}

export async function getRecentJobs(db: Db, since: Date): Promise<{ jobId: string; job: ScorableJob }[]> {
  const { data, error } = await db
    .from('jobs')
    .select('id, title, description_text, tags, remote_type, seniority, location, salary_min_usd, salary_max_usd, skills')
    .eq('status', 'active')
    .gte('first_seen_at', since.toISOString())
    .limit(3000);
  if (error) throw error;
  return data.map((j) => ({
    jobId: j.id,
    job: {
      title: j.title,
      descriptionText: j.description_text,
      tags: j.tags,
      remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === j.remote_type) ?? 'unknown',
      seniority: (SENIORITIES as readonly string[]).includes(j.seniority ?? '') ? (j.seniority as Seniority) : null,
      location: j.location,
      salaryMinUsd: j.salary_min_usd,
      salaryMaxUsd: j.salary_max_usd,
      skills: j.skills,
    },
  }));
}

export type MatchRow = {
  user_id: string;
  job_id: string;
  search_profile_id: string;
  score: number;
  breakdown: Json;
  state: 'new' | 'hidden';
};

export async function insertMatches(db: Db, rows: MatchRow[]): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from('job_matches')
      .upsert(rows.slice(i, i + 500), { onConflict: 'user_id,job_id', ignoreDuplicates: true });
    if (error) throw error;
  }
}
```

Если сгенерированный тип `row.search_profiles` у embed-запроса — массив, а не объект, использовать `[row.search_profiles].flat()[0]` и описать в отчёте.

- [ ] **Step 4: Матчинг, run-query, синхронизация, истечение**

`apps/jobs/src/pipeline/match.ts`:
```ts
import { type ScorableJob, type SearchProfile, scoreJob } from '@jp/core';
import type { Json } from '@jp/db';
import type { Db } from '../db';
import { insertMatches, type MatchRow } from './repository';

export async function matchJobs(
  db: Db,
  profiles: SearchProfile[],
  jobs: { jobId: string; job: ScorableJob }[],
): Promise<number> {
  const best = new Map<string, MatchRow>();
  for (const profile of profiles) {
    for (const { jobId, job } of jobs) {
      const result = scoreJob(profile, job);
      if (!result) continue;
      const key = `${profile.userId}:${jobId}`;
      const prev = best.get(key);
      if (prev && prev.score >= result.score) continue;
      best.set(key, {
        user_id: profile.userId,
        job_id: jobId,
        search_profile_id: profile.id,
        score: result.score,
        breakdown: result.breakdown as unknown as Json,
        state: result.hidden ? 'hidden' : 'new',
      });
    }
  }
  const rows = [...best.values()];
  await insertMatches(db, rows);
  return rows.filter((r) => r.state === 'new').length;
}
```

`apps/jobs/src/pipeline/run-query.ts`:
```ts
import { normalizeJob, type NormalizedJob } from '@jp/core';
import { type AdapterContext, SourceBlockedError, type SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';
import { matchJobs } from './match';
import {
  finishRun,
  getProfilesForQuery,
  getQuery,
  getSource,
  markQueryRun,
  saveJob,
  startRun,
  updateSourceHealth,
} from './repository';

export type RunQueryDeps = {
  db: Db;
  adapters: Record<string, SourceAdapter>;
  createContext: (sourceId: string) => AdapterContext;
  env?: Record<string, string | undefined>;
  now?: () => Date;
};

export type RunQueryResult = {
  status: 'ok' | 'skipped' | 'blocked';
  found: number;
  inserted: number;
  matched: number;
  alert: string | null;
};

const SKIPPED: RunQueryResult = { status: 'skipped', found: 0, inserted: 0, matched: 0, alert: null };

export async function runQuery(deps: RunQueryDeps, queryId: string): Promise<RunQueryResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const query = await getQuery(db, queryId);
  if (!query) return SKIPPED;
  const source = await getSource(db, query.source_id);
  const adapter = deps.adapters[query.source_id];
  const paused = source.paused_until !== null && new Date(source.paused_until) > now;
  if (!source.enabled || !adapter || paused || adapter.isConfigured?.(deps.env ?? {}) === false) return SKIPPED;

  const runId = await startRun(db, source.id, queryId, now);
  try {
    const raw = await adapter.search(query.params as Record<string, string>, deps.createContext(source.id));
    const normalized = (await Promise.all(raw.map(normalizeJob))).filter((j): j is NormalizedJob => j !== null);

    let inserted = 0;
    const saved: { jobId: string; job: NormalizedJob }[] = [];
    for (const job of normalized) {
      const result = await saveJob(db, source.id, job, now);
      if (result.isNew) inserted++;
      saved.push({ jobId: result.jobId, job });
    }

    const matched = await matchJobs(db, await getProfilesForQuery(db, queryId), saved);
    await finishRun(db, runId, { status: 'ok', found: raw.length, inserted });
    const { alert } = await updateSourceHealth(db, source, raw.length === 0 ? 'empty' : 'ok', now);
    await markQueryRun(db, queryId, now, source.min_interval_minutes);
    return { status: 'ok', found: raw.length, inserted, matched, alert };
  } catch (err) {
    if (err instanceof SourceBlockedError) {
      await finishRun(db, runId, { status: 'blocked', found: 0, inserted: 0, error: err.message });
      const { alert } = await updateSourceHealth(db, source, 'blocked', now);
      await markQueryRun(db, queryId, now, source.min_interval_minutes);
      return { status: 'blocked', found: 0, inserted: 0, matched: 0, alert };
    }
    await finishRun(db, runId, {
      status: 'error',
      found: 0,
      inserted: 0,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
```

`apps/jobs/src/pipeline/sync-profiles.ts`:
```ts
import { buildSourceQueries, type SearchProfile } from '@jp/core';
import type { Db } from '../db';
import { matchJobs } from './match';
import { getActiveProfiles, getRecentJobs } from './repository';

const RECENT_DAYS = 7;

async function linkQueries(db: Db, profile: SearchProfile): Promise<string[]> {
  const specs = buildSourceQueries(profile);
  const { error: upsertError } = await db
    .from('search_queries')
    .upsert(
      specs.map((s) => ({ source_id: s.sourceId, query_key: s.queryKey, params: s.params })),
      { onConflict: 'query_key', ignoreDuplicates: true },
    );
  if (upsertError) throw upsertError;

  const { data, error } = await db
    .from('search_queries')
    .select('id')
    .in('query_key', specs.map((s) => s.queryKey));
  if (error) throw error;
  const ids = data.map((q) => q.id);

  const { error: deleteError } = await db
    .from('search_profile_queries')
    .delete()
    .eq('search_profile_id', profile.id)
    .not('search_query_id', 'in', `(${ids.join(',')})`);
  if (deleteError) throw deleteError;

  const { error: linkError } = await db
    .from('search_profile_queries')
    .upsert(
      ids.map((id) => ({ search_profile_id: profile.id, search_query_id: id })),
      { onConflict: 'search_profile_id,search_query_id', ignoreDuplicates: true },
    );
  if (linkError) throw linkError;
  return ids;
}

export async function syncProfile(
  db: Db,
  profile: SearchProfile & { isActive?: boolean },
  now: Date,
): Promise<{ queryIds: string[]; matched: number }> {
  if (profile.isActive === false) {
    const { error } = await db.from('search_profile_queries').delete().eq('search_profile_id', profile.id);
    if (error) throw error;
    return { queryIds: [], matched: 0 };
  }
  const queryIds = await linkQueries(db, profile);
  const since = new Date(now.getTime() - RECENT_DAYS * 24 * 3600 * 1000);
  const matched = await matchJobs(db, [profile], await getRecentJobs(db, since));
  return { queryIds, matched };
}

export async function syncAllProfiles(db: Db, now: Date): Promise<number> {
  const profiles = await getActiveProfiles(db);
  for (const profile of profiles) await linkQueries(db, profile);
  return profiles.length;
}
```

`apps/jobs/src/pipeline/expire.ts`:
```ts
import type { Db } from '../db';

export async function expireJobs(db: Db, now: Date, days = 14): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db
    .from('jobs')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('last_seen_at', cutoff)
    .select('id');
  if (error) throw error;
  return data.length;
}
```

- [ ] **Step 5: Тесты проходят**

Run: `supabase db reset && pnpm db:env && pnpm --filter @jp/jobs test:integration && pnpm --filter @jp/jobs typecheck`
Expected: PASS (6 тестов).

- [ ] **Step 6: Commit**

```bash
git add apps/jobs scripts/supabase-env.sh pnpm-lock.yaml
git commit -m "feat(jobs): add ingestion pipeline with dedupe, matching and source health

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Trigger.dev задачи и локальный `run-once`

**Files:**
- Create: `apps/jobs/trigger.config.ts`, `apps/jobs/src/runtime.ts`, `apps/jobs/src/trigger/queues.ts`, `apps/jobs/src/trigger/scrape-query.ts`, `apps/jobs/src/trigger/schedule-queries.ts`, `apps/jobs/src/trigger/sync-profile.ts`, `apps/jobs/src/trigger/expire-jobs.ts`, `apps/jobs/src/cli/run-once.ts`

**Interfaces:**
- Consumes: Task 11.
- Produces:
  - `pipelineDeps(): RunQueryDeps` (`src/runtime.ts`) — реальные адаптеры + HTTP-контекст на источник.
  - Задачи Trigger.dev: `scrape-query` (payload `{ queryId: string; sourceId: SourceId }`, очередь `scrape-<sourceId>` с `concurrencyLimit: 1`), `schedule-queries` (cron `5 * * * *`), `sync-profile` (payload `{ profileId: string }`), `expire-jobs` (cron `0 3 * * *`).
  - CLI: `pnpm --filter @jp/jobs run-once [--force] [--source=<id>]`.

- [ ] **Step 1: Runtime и очереди**

`apps/jobs/src/runtime.ts`:
```ts
import { ADAPTERS, createHttpContext } from '@jp/scrapers';
import { getDb } from './db';
import { jobsEnv } from './env';
import type { RunQueryDeps } from './pipeline/run-query';

export function pipelineDeps(): RunQueryDeps {
  const env = jobsEnv();
  const adapterEnv = { JOOBLE_API_KEY: env.JOOBLE_API_KEY };
  return {
    db: getDb(),
    adapters: ADAPTERS,
    env: adapterEnv,
    createContext: () => createHttpContext({ userAgent: env.SCRAPER_USER_AGENT }, adapterEnv),
  };
}
```

`apps/jobs/src/trigger/queues.ts`:
```ts
import { SOURCE_IDS, type SourceId } from '@jp/core';
import { queue } from '@trigger.dev/sdk';

/** One queue per source so we never hit a site with parallel requests. */
export const SOURCE_QUEUES = Object.fromEntries(
  SOURCE_IDS.map((id) => [id, queue({ name: `scrape-${id}`, concurrencyLimit: 1 })]),
) as Record<SourceId, ReturnType<typeof queue>>;
```

- [ ] **Step 2: Задачи**

`apps/jobs/src/trigger/scrape-query.ts`:
```ts
import type { SourceId } from '@jp/core';
import { logger, task } from '@trigger.dev/sdk';
import { runQuery } from '../pipeline/run-query';
import { pipelineDeps } from '../runtime';

export const scrapeQuery = task({
  id: 'scrape-query',
  maxDuration: 300,
  retry: { maxAttempts: 3, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000, factor: 2 },
  run: async (payload: { queryId: string; sourceId: SourceId }) => {
    const result = await runQuery(pipelineDeps(), payload.queryId);
    if (result.alert) logger.error(result.alert, { sourceId: payload.sourceId });
    logger.info('query done', { ...payload, ...result });
    return result;
  },
});
```

`apps/jobs/src/trigger/schedule-queries.ts`:
```ts
import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { getDueQueryIds } from '../pipeline/repository';
import { syncAllProfiles } from '../pipeline/sync-profiles';
import { scrapeQuery } from './scrape-query';
import { SOURCE_QUEUES } from './queues';

export const scheduleQueries = schedules.task({
  id: 'schedule-queries',
  cron: '5 * * * *',
  run: async () => {
    const db = getDb();
    const now = new Date();
    const profiles = await syncAllProfiles(db, now);
    const due = await getDueQueryIds(db, now);
    if (due.length > 0) {
      await scrapeQuery.batchTrigger(
        due.map((q) => ({
          payload: { queryId: q.id, sourceId: q.sourceId as keyof typeof SOURCE_QUEUES },
          options: { queue: `scrape-${q.sourceId}` },
        })),
      );
    }
    logger.info('scheduled', { profiles, queries: due.length });
    return { profiles, queries: due.length };
  },
});
```
Если `options.queue` в Trigger.dev 4.6.4 ожидает объект очереди, а не имя — передать `SOURCE_QUEUES[q.sourceId]` (проверить тип `TriggerOptions['queue']` в `node_modules/@trigger.dev/sdk`), и описать в отчёте.

`apps/jobs/src/trigger/sync-profile.ts`:
```ts
import { logger, task } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { getProfile } from '../pipeline/repository';
import { syncProfile } from '../pipeline/sync-profiles';

export const syncProfileTask = task({
  id: 'sync-profile',
  run: async (payload: { profileId: string }) => {
    const db = getDb();
    const profile = await getProfile(db, payload.profileId);
    if (!profile) return { queryIds: 0, matched: 0 };
    const result = await syncProfile(db, profile, new Date());
    logger.info('profile synced', { profileId: payload.profileId, ...result });
    return { queryIds: result.queryIds.length, matched: result.matched };
  },
});
```

`apps/jobs/src/trigger/expire-jobs.ts`:
```ts
import { logger, schedules } from '@trigger.dev/sdk';
import { getDb } from '../db';
import { expireJobs } from '../pipeline/expire';

export const expireJobsTask = schedules.task({
  id: 'expire-jobs',
  cron: '0 3 * * *',
  run: async () => {
    const expired = await expireJobs(getDb(), new Date());
    logger.info('expired jobs', { expired });
    return { expired };
  },
});
```

`apps/jobs/trigger.config.ts`:
```ts
import { config as loadEnv } from 'dotenv';
import { defineConfig } from '@trigger.dev/sdk';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? 'proj_set_TRIGGER_PROJECT_REF',
  dirs: ['./src/trigger'],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2 },
  },
});
```

- [ ] **Step 3: Локальный запуск без облака**

`apps/jobs/src/cli/run-once.ts`:
```ts
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const { getDb } = await import('../db');
const { getDueQueryIds } = await import('../pipeline/repository');
const { runQuery } = await import('../pipeline/run-query');
const { syncAllProfiles } = await import('../pipeline/sync-profiles');
const { pipelineDeps } = await import('../runtime');

const force = process.argv.includes('--force');
const onlySource = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1];

const db = getDb();
const now = new Date();
console.log(`profiles synced: ${await syncAllProfiles(db, now)}`);

if (force) {
  await db.from('search_queries').update({ next_run_at: now.toISOString() }).gte('next_run_at', '1970-01-01');
}
const due = (await getDueQueryIds(db, now)).filter((q) => !onlySource || q.sourceId === onlySource);
console.log(`queries due: ${due.length}`);

const deps = pipelineDeps();
for (const q of due) {
  try {
    const r = await runQuery(deps, q.id);
    console.log(`${q.sourceId.padEnd(10)} ${r.status.padEnd(8)} found=${r.found} new=${r.inserted} matched=${r.matched}${r.alert ? `  ⚠ ${r.alert}` : ''}`);
  } catch (err) {
    console.error(`${q.sourceId.padEnd(10)} error    ${err instanceof Error ? err.message : err}`);
  }
}
```

- [ ] **Step 4: Проверка**

Run: `pnpm --filter @jp/jobs typecheck`
Expected: без ошибок.

Ручная проверка на живых источниках (нужен хотя бы один поисковый профиль — создать SQL-ом в Supabase Studio `http://127.0.0.1:54323` или после Task 13 через UI):
```bash
pnpm --filter @jp/jobs run-once --force --source=dou
```
Expected: строка `dou        ok       found=… new=… matched=…` без ошибок.

Если `TRIGGER_PROJECT_REF`/`TRIGGER_SECRET_KEY` уже в `apps/jobs/.env` (Task 0):
```bash
pnpm --filter @jp/jobs dev
```
Expected: CLI регистрирует 4 задачи (`scrape-query`, `schedule-queries`, `sync-profile`, `expire-jobs`); тестовый запуск `schedule-queries` из дашборда Trigger.dev проходит. Если ключей ещё нет — этот шаг пропускается и отмечается в отчёте.

- [ ] **Step 5: Commit**

```bash
git add apps/jobs
git commit -m "feat(jobs): add Trigger.dev tasks and local run-once CLI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Веб — настройки поиска (`/search`)

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/search/page.tsx`, `apps/web/src/app/[locale]/(app)/search/actions.ts`, `apps/web/src/app/[locale]/(app)/search/search-profile-form.tsx`, `apps/web/src/lib/trigger.ts`
- Modify: `apps/web/messages/{en,uk,ru}.json`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/package.json`, `apps/web/.env.example`

**Interfaces:**
- Consumes: `searchProfileInputSchema`, `parseList`, `SENIORITIES`, `SEARCH_REMOTE_TYPES` из `@jp/core`; `getUserId`, `requireUserId` из `@/lib/auth`; `createClient`.
- Produces:
  - `saveSearchProfile(prev: SearchFormState, formData: FormData): Promise<SearchFormState>`, `deleteSearchProfile(formData: FormData): Promise<void>`; `type SearchFormState = { status: 'idle' | 'saved' | 'invalid' | 'error'; fields?: string[] }`
  - `requestProfileSync(profileId: string): Promise<void>` (`lib/trigger.ts`) — вызывает задачу `sync-profile` через `@trigger.dev/sdk` `tasks.trigger`, если задан `TRIGGER_SECRET_KEY`, иначе no-op (почасовой `schedule-queries` подхватит).
  - Поля формы: `id` (hidden), `name`, `keywords`, `skills`, `excludeKeywords`, `locations` (через запятую), `seniority` (чекбоксы, значения `SENIORITIES`), `remoteType` (select), `salaryMinUsd` (number), `isActive` (checkbox); `data-testid="search-save"`, `data-testid="search-delete"`, `data-testid="search-add"`.
  - Пункт навигации `search` (иконка `SlidersHorizontal`), показывается и на мобайле вместо `analytics`.

- [ ] **Step 1: Переводы**

Во все три файла `apps/web/messages/*.json` добавить ключ `nav.search` и пространство `search`. `en.json`:
```json
"search": {
  "title": "Job search settings",
  "intro": "Tell us what you are looking for — we'll collect matching jobs from DOU, Djinni, robota.ua, remote boards and more every hour.",
  "name": "Profile name",
  "keywords": "Role keywords",
  "keywordsHint": "Comma-separated, up to 5. Example: full stack, react developer",
  "skills": "Your skills",
  "skillsHint": "Comma-separated. Used for scoring. Example: React, Node.js, PostgreSQL",
  "exclude": "Exclude jobs mentioning",
  "excludeHint": "Comma-separated stop words. Example: 1C, gambling",
  "seniority": "Seniority",
  "remoteType": "Work format",
  "remote_any": "Any",
  "remote_remote": "Remote only",
  "remote_hybrid": "Hybrid",
  "remote_office": "Office",
  "locations": "Cities (for office/hybrid)",
  "salaryMin": "Minimum salary, USD / month",
  "active": "Active",
  "save": "Save",
  "saved": "Saved — fresh jobs will appear on Today within an hour",
  "invalid": "Check these fields: {fields}",
  "error": "Couldn't save. Please try again.",
  "delete": "Delete",
  "add": "Add another search profile",
  "newProfile": "New search",
  "level_intern": "Intern",
  "level_junior": "Junior",
  "level_middle": "Middle",
  "level_senior": "Senior",
  "level_lead": "Lead"
}
```
`nav.search`: en `"Search"`, uk `"Пошук"`, ru `"Поиск"`. Аналогичные блоки `search` на украинском и русском (естественный перевод тех же строк; `{fields}` сохранить). Тест паритета ключей (`messages.test.ts`) должен проходить.

- [ ] **Step 2: Навигация**

`apps/web/src/components/shell/nav-items.ts`: импортировать `SlidersHorizontal` из `lucide-react`, расширить `NavKey` значением `'search'` и добавить после `board`:
```ts
{ key: 'search', href: '/search', icon: SlidersHorizontal, mobile: true },
```
и для `analytics` оставить `mobile: false`. Если иконка отсутствует в установленной версии — взять `Settings2` и указать в отчёте.

- [ ] **Step 3: Триггер синхронизации**

Run: `pnpm --filter @jp/web add @trigger.dev/sdk@4.6.4`

`apps/web/src/lib/trigger.ts`:
```ts
import 'server-only';
import { tasks } from '@trigger.dev/sdk';

/** Asks the worker to rebuild queries and re-match recent jobs; hourly scheduling covers it otherwise. */
export async function requestProfileSync(profileId: string): Promise<void> {
  if (!process.env.TRIGGER_SECRET_KEY) return;
  try {
    await tasks.trigger('sync-profile', { profileId });
  } catch (err) {
    console.error('sync-profile trigger failed', err);
  }
}
```

`apps/web/.env.example` — добавить строку `TRIGGER_SECRET_KEY=` с комментарием `# optional: instant re-sync after saving search settings`.

- [ ] **Step 4: Серверные действия**

`apps/web/src/app/[locale]/(app)/search/actions.ts`:
```ts
'use server';

import { parseList, searchProfileInputSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

export type SearchFormState = { status: 'idle' | 'saved' | 'invalid' | 'error'; fields?: string[] };

export async function saveSearchProfile(_prev: SearchFormState, formData: FormData): Promise<SearchFormState> {
  const salary = String(formData.get('salaryMinUsd') ?? '').trim();
  const parsed = searchProfileInputSchema.safeParse({
    id: String(formData.get('id') ?? '') || undefined,
    name: String(formData.get('name') ?? ''),
    keywords: parseList(String(formData.get('keywords') ?? ''), 5),
    skills: parseList(String(formData.get('skills') ?? '')),
    excludeKeywords: parseList(String(formData.get('excludeKeywords') ?? '')),
    seniority: formData.getAll('seniority').map(String),
    locations: parseList(String(formData.get('locations') ?? ''), 10),
    remoteType: String(formData.get('remoteType') ?? 'any'),
    salaryMinUsd: salary === '' ? null : Number(salary),
    isActive: formData.get('isActive') === 'on',
  });
  if (!parsed.success) {
    return { status: 'invalid', fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  }

  const userId = await getUserId();
  if (!userId) return { status: 'error' };
  const p = parsed.data;
  const row = {
    user_id: userId,
    name: p.name,
    keywords: p.keywords,
    skills: p.skills,
    exclude_keywords: p.excludeKeywords,
    seniority: p.seniority,
    locations: p.locations,
    remote_type: p.remoteType,
    salary_min_usd: p.salaryMinUsd,
    is_active: p.isActive,
  };

  const supabase = await createClient();
  const { data, error } = p.id
    ? await supabase.from('search_profiles').update(row).eq('id', p.id).select('id').single()
    : await supabase.from('search_profiles').insert(row).select('id').single();
  if (error) return { status: 'error' };

  await requestProfileSync(data.id);
  revalidatePath('/[locale]/search', 'page');
  return { status: 'saved' };
}

export async function deleteSearchProfile(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id || !(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from('search_profiles').delete().eq('id', id);
  revalidatePath('/[locale]/search', 'page');
}
```

- [ ] **Step 5: Форма и страница**

`apps/web/src/app/[locale]/(app)/search/search-profile-form.tsx`:
```tsx
'use client';

import { SEARCH_REMOTE_TYPES, SENIORITIES } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteSearchProfile, saveSearchProfile, type SearchFormState } from './actions';

export type SearchProfileValues = {
  id?: string;
  name: string;
  keywords: string[];
  skills: string[];
  excludeKeywords: string[];
  seniority: string[];
  locations: string[];
  remoteType: string;
  salaryMinUsd: number | null;
  isActive: boolean;
};

const input = 'brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand';

function TextField({ name, label, hint, defaultValue, invalid }: { name: string; label: string; hint?: string; defaultValue: string; invalid: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase">{label}</span>
      <input name={name} defaultValue={defaultValue} aria-invalid={invalid} className={`${input} ${invalid ? 'border-danger' : ''}`} />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function SearchProfileForm({ values }: { values: SearchProfileValues }) {
  const t = useTranslations('search');
  const [state, action, pending] = useActionState<SearchFormState, FormData>(saveSearchProfile, { status: 'idle' });
  const invalid = new Set(state.fields ?? []);

  return (
    <div className="brutal flex flex-col gap-4 p-5">
      <form action={action} noValidate className="flex flex-col gap-4">
        {values.id && <input type="hidden" name="id" value={values.id} />}
        <TextField name="name" label={t('name')} defaultValue={values.name} invalid={invalid.has('name')} />
        <TextField name="keywords" label={t('keywords')} hint={t('keywordsHint')} defaultValue={values.keywords.join(', ')} invalid={invalid.has('keywords')} />
        <TextField name="skills" label={t('skills')} hint={t('skillsHint')} defaultValue={values.skills.join(', ')} invalid={invalid.has('skills')} />
        <TextField name="excludeKeywords" label={t('exclude')} hint={t('excludeHint')} defaultValue={values.excludeKeywords.join(', ')} invalid={invalid.has('excludeKeywords')} />

        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 font-mono text-xs uppercase">{t('seniority')}</legend>
          {SENIORITIES.map((level) => (
            <label key={level} className="flex items-center gap-2">
              <input type="checkbox" name="seniority" value={level} defaultChecked={values.seniority.includes(level)} />
              {t(`level_${level}`)}
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase">{t('remoteType')}</span>
            <select name="remoteType" defaultValue={values.remoteType} className={input}>
              {SEARCH_REMOTE_TYPES.map((r) => (
                <option key={r} value={r}>
                  {t(`remote_${r}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField name="locations" label={t('locations')} defaultValue={values.locations.join(', ')} invalid={invalid.has('locations')} />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase">{t('salaryMin')}</span>
            <input name="salaryMinUsd" type="number" min={0} defaultValue={values.salaryMinUsd ?? ''} className={input} />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={values.isActive} />
          {t('active')}
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="brand" disabled={pending} data-testid="search-save">
            {t('save')}
          </Button>
          <p role="status" className="text-sm">
            {state.status === 'saved' && <span className="text-success">{t('saved')}</span>}
            {state.status === 'invalid' && <span className="text-danger">{t('invalid', { fields: [...invalid].join(', ') })}</span>}
            {state.status === 'error' && <span className="text-danger">{t('error')}</span>}
          </p>
        </div>
      </form>
      {values.id && (
        <form action={deleteSearchProfile}>
          <input type="hidden" name="id" value={values.id} />
          <Button type="submit" variant="ghost" data-testid="search-delete">
            {t('delete')}
          </Button>
        </form>
      )}
    </div>
  );
}
```

`apps/web/src/app/[locale]/(app)/search/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { SearchProfileForm, type SearchProfileValues } from './search-profile-form';

const EMPTY: SearchProfileValues = {
  name: '',
  keywords: [],
  skills: [],
  excludeKeywords: [],
  seniority: [],
  locations: [],
  remoteType: 'any',
  salaryMinUsd: null,
  isActive: true,
};

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  await requireUserId();
  const { new: addNew } = await searchParams;
  const t = await getTranslations('search');
  const supabase = await createClient();
  const { data } = await supabase
    .from('search_profiles')
    .select('id, name, keywords, skills, exclude_keywords, seniority, locations, remote_type, salary_min_usd, is_active')
    .order('created_at');

  const profiles: SearchProfileValues[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    keywords: p.keywords,
    skills: p.skills,
    excludeKeywords: p.exclude_keywords,
    seniority: p.seniority,
    locations: p.locations,
    remoteType: p.remote_type,
    salaryMinUsd: p.salary_min_usd,
    isActive: p.is_active,
  }));
  const showNew = profiles.length === 0 || addNew === '1';

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('intro')}</p>
      </div>
      {profiles.map((p) => (
        <SearchProfileForm key={p.id} values={p} />
      ))}
      {showNew ? (
        <SearchProfileForm values={{ ...EMPTY, name: t('newProfile') }} />
      ) : (
        <Link href="/search?new=1" className="brutal brutal-press self-start px-4 py-2 font-semibold" data-testid="search-add">
          + {t('add')}
        </Link>
      )}
    </section>
  );
}
```
(`requireUserId` из `@/lib/auth` — сигнатура как в Плане 1 fix-wave; если она требует `locale`, передать его из `params`.)

- [ ] **Step 6: Проверка**

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web lint && pnpm --filter @jp/web test && pnpm --filter @jp/web build`
Expected: без ошибок.

- [ ] **Step 7: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): add job search settings page with instant re-sync

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Веб — временный список совпадений на «Today»

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/today/actions.ts`, `apps/web/src/app/[locale]/(app)/today/job-match-card.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/today/page.tsx`, `apps/web/messages/{en,uk,ru}.json`

**Interfaces:**
- Consumes: `job_matches` + `jobs` + `companies` + `job_postings` (RLS отдаёт только свои совпадения).
- Produces:
  - `setMatchState(formData: FormData): Promise<void>` — поля `matchId`, `state` (`hidden` | `seen`).
  - `SOURCE_LABELS: Record<string, string>` (`dou: 'DOU'`, `djinni: 'Djinni'`, `robotaua: 'robota.ua'`, `jooble: 'Jooble'`, `remoteok: 'Remote OK'`, `remotive: 'Remotive'`, `himalayas: 'Himalayas'`, `wwr: 'We Work Remotely'`, `hn: 'HN Who's Hiring'`) — в `job-match-card.tsx`.
  - Карточка `data-testid="job-match"`, кнопка `data-testid="match-hide"`, бейдж score `data-testid="match-score"`.
  - Пустое состояние со ссылкой на `/search` (`data-testid="today-empty"`).

- [ ] **Step 1: Переводы**

Во всех трёх файлах заменить пространство `pages.today` на:
```json
"today": {
  "title": "Today",
  "subtitle": "{count} matching jobs from the last 3 days",
  "empty": "No matches yet. Set up what you're looking for — the first jobs arrive within an hour.",
  "setup": "Set up job search",
  "hide": "Hide",
  "open": "Open on {source}",
  "match": "match",
  "remote_remote": "Remote",
  "remote_hybrid": "Hybrid",
  "remote_office": "Office",
  "remote_unknown": "Format not specified",
  "salary": "${min}–{max}/mo",
  "salaryFrom": "from ${min}/mo",
  "salaryTo": "up to ${max}/mo"
}
```
(на верхнем уровне, рядом с `pages`; ключ `pages.today.title` оставить для совместимости). Украинская и русская версии — естественный перевод. Удалить `comingSoon.today`, если страница больше его не использует (и тест паритета остаётся зелёным).

- [ ] **Step 2: Действие**

`apps/web/src/app/[locale]/(app)/today/actions.ts`:
```ts
'use server';

import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const ALLOWED = new Set(['hidden', 'seen']);

export async function setMatchState(formData: FormData): Promise<void> {
  const matchId = String(formData.get('matchId') ?? '');
  const state = String(formData.get('state') ?? '');
  if (!matchId || !ALLOWED.has(state) || !(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from('job_matches').update({ state }).eq('id', matchId);
  revalidatePath('/[locale]/today', 'page');
}
```

- [ ] **Step 3: Карточка**

`apps/web/src/app/[locale]/(app)/today/job-match-card.tsx`:
```tsx
import { getFormatter, getTranslations } from 'next-intl/server';
import { setMatchState } from './actions';

export const SOURCE_LABELS: Record<string, string> = {
  dou: 'DOU',
  djinni: 'Djinni',
  robotaua: 'robota.ua',
  jooble: 'Jooble',
  remoteok: 'Remote OK',
  remotive: 'Remotive',
  himalayas: 'Himalayas',
  wwr: 'We Work Remotely',
  hn: "HN Who's Hiring",
};

export type JobMatchView = {
  id: string;
  score: number;
  title: string;
  company: string;
  location: string | null;
  remoteType: 'remote' | 'hybrid' | 'office' | 'unknown';
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  seenAt: string;
  postings: { sourceId: string; url: string }[];
};

export async function JobMatchCard({ match }: { match: JobMatchView }) {
  const t = await getTranslations('today');
  const format = await getFormatter();
  const salary =
    match.salaryMinUsd && match.salaryMaxUsd && match.salaryMinUsd !== match.salaryMaxUsd
      ? t('salary', { min: match.salaryMinUsd, max: match.salaryMaxUsd })
      : match.salaryMinUsd
        ? t('salaryFrom', { min: match.salaryMinUsd })
        : match.salaryMaxUsd
          ? t('salaryTo', { max: match.salaryMaxUsd })
          : null;
  const scoreTone = match.score >= 80 ? 'bg-brand text-brand-foreground' : match.score >= 60 ? 'bg-card' : 'bg-muted';

  return (
    <article data-testid="job-match" className="brutal flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight">{match.title}</h2>
          <p className="text-muted-foreground">{match.company}</p>
        </div>
        <span data-testid="match-score" className={`shrink-0 rounded-sm border-2 border-border px-2 py-1 font-mono text-sm font-bold ${scoreTone}`}>
          {match.score}% {t('match')}
        </span>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase text-muted-foreground">
        <span>{t(`remote_${match.remoteType}`)}</span>
        {match.location && <span>{match.location}</span>}
        {salary && <span>{salary}</span>}
        <span>{format.relativeTime(new Date(match.seenAt))}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {match.postings.map((p) => (
          <a
            key={p.url}
            href={p.url}
            target="_blank"
            rel="noopener"
            className="brutal brutal-press px-3 py-1.5 text-sm font-semibold"
          >
            {t('open', { source: SOURCE_LABELS[p.sourceId] ?? p.sourceId })} ↗
          </a>
        ))}
        <form action={setMatchState} className="ml-auto">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="state" value="hidden" />
          <button type="submit" data-testid="match-hide" className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
            {t('hide')}
          </button>
        </form>
      </div>
    </article>
  );
}
```
Атрибут `rel="noopener"` без `nofollow` — требование RemoteOK (follow-ссылка на источник).

- [ ] **Step 4: Страница**

`apps/web/src/app/[locale]/(app)/today/page.tsx` (заменить целиком):
```tsx
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { JobMatchCard, type JobMatchView } from './job-match-card';

const REMOTE = ['remote', 'hybrid', 'office'] as const;

export default async function TodayPage() {
  await requireUserId();
  const t = await getTranslations('today');
  const supabase = await createClient();
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data } = await supabase
    .from('job_matches')
    .select(
      'id, score, created_at, jobs!inner(title, location, remote_type, salary_min_usd, salary_max_usd, companies(name), job_postings(source_id, url))',
    )
    .in('state', ['new', 'seen'])
    .gte('created_at', since)
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  const matches: JobMatchView[] = (data ?? []).map((m) => ({
    id: m.id,
    score: m.score,
    title: m.jobs.title,
    company: m.jobs.companies?.name ?? '',
    location: m.jobs.location,
    remoteType: REMOTE.find((r) => r === m.jobs.remote_type) ?? 'unknown',
    salaryMinUsd: m.jobs.salary_min_usd,
    salaryMaxUsd: m.jobs.salary_max_usd,
    seenAt: m.created_at,
    postings: m.jobs.job_postings.map((p) => ({ sourceId: p.source_id, url: p.url })),
  }));

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
        {matches.length > 0 && <p className="mt-2 text-muted-foreground">{t('subtitle', { count: matches.length })}</p>}
      </div>
      {matches.length === 0 ? (
        <div data-testid="today-empty" className="brutal flex max-w-xl flex-col gap-4 p-6">
          <p className="text-lg">{t('empty')}</p>
          <Link href="/search" className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">
            {t('setup')}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {matches.map((m) => (
            <JobMatchCard key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}
```
Если сгенерированные типы описывают `m.jobs` / `companies` как массивы (embed по FK), привести через `[x].flat()[0]` и описать в отчёте.

- [ ] **Step 5: Проверка**

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web lint && pnpm --filter @jp/web test && pnpm --filter @jp/web build`
Expected: без ошибок.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): show today's job matches with source links and hide action

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: E2E и CI

**Files:**
- Create: `apps/web/e2e/search.spec.ts`, `apps/web/e2e/today.spec.ts`, `apps/web/e2e/helpers/seed.ts`
- Modify: `apps/web/e2e/shell.spec.ts` (если навигация/тексты изменились), `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `loginAs`, `uniqueEmail` (План 1); все UI выше.
- Produces: `seedMatch(email: string, opts?: { title?: string; score?: number }): Promise<{ matchId: string; title: string }>` — создаёт через admin-клиент компанию, вакансию, posting (`dou`) и совпадение для пользователя.

- [ ] **Step 1: Хелпер сидирования**

`apps/web/e2e/helpers/seed.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

async function userIdByEmail(email: string): Promise<string> {
  const db = admin();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find((u) => u.email === email);
    if (user) return user.id;
    if (data.users.length < 200) break;
  }
  throw new Error(`user ${email} not found`);
}

export async function seedMatch(email: string, opts: { title?: string; score?: number } = {}) {
  const db = admin();
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = opts.title ?? `Senior Full Stack Developer ${tag}`;
  const userId = await userIdByEmail(email);
  const { data: company, error: cErr } = await db
    .from('companies')
    .insert({ name: `Acme ${tag}`, normalized_name: `acme ${tag}` })
    .select('id')
    .single();
  if (cErr) throw cErr;
  const { data: job, error: jErr } = await db
    .from('jobs')
    .insert({ fingerprint: `e2e-${tag}`, title, company_id: company.id, remote_type: 'remote', salary_min_usd: 3000, salary_max_usd: 4500 })
    .select('id')
    .single();
  if (jErr) throw jErr;
  await db.from('job_postings').insert({ job_id: job.id, source_id: 'dou', external_id: `e2e-${tag}`, url: `https://jobs.dou.ua/vacancies/${tag}/` });
  const { data: match, error: mErr } = await db
    .from('job_matches')
    .insert({ user_id: userId, job_id: job.id, score: opts.score ?? 88 })
    .select('id')
    .single();
  if (mErr) throw mErr;
  return { matchId: match.id, title };
}
```

- [ ] **Step 2: Тесты**

`apps/web/e2e/search.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('creates a search profile and keeps it after reload', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search'));
  await page.goto('/en/search');
  await page.getByLabel('Profile name').fill('Full-Stack remote');
  await page.getByLabel('Role keywords').fill('full stack, react developer');
  await page.getByLabel('Your skills').fill('React, Node.js, PostgreSQL');
  await page.getByLabel('Senior').check();
  await page.getByLabel('Work format').selectOption('remote');
  await page.getByTestId('search-save').click();
  // the "new profile" form is replaced by the saved profile's form + an "add" link
  await expect(page.getByTestId('search-add')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Role keywords').first()).toHaveValue('full stack, react developer');
  await page.getByLabel('Your skills').first().fill('React, Node.js');
  await page.getByTestId('search-save').first().click();
  await expect(page.getByRole('status').first()).toContainText('Saved');
});

test('rejects a profile without keywords', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-invalid'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('');
  await page.getByTestId('search-save').click();
  await expect(page.getByRole('status').first()).toContainText('keywords');
});
```

`apps/web/e2e/today.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedMatch } from './helpers/seed';

test('shows the empty state with a link to search settings', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('today-empty'));
  await page.goto('/en/today');
  await expect(page.getByTestId('today-empty')).toBeVisible();
  await page.getByRole('link', { name: 'Set up job search' }).click();
  await expect(page).toHaveURL(/\/en\/search$/);
});

test('lists a match with score and source link, and hides it', async ({ context, page }) => {
  const email = uniqueEmail('today');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 88 });
  await page.goto('/en/today');
  const card = page.getByTestId('job-match').filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByTestId('match-score')).toContainText('88%');
  await expect(card.getByRole('link', { name: /Open on DOU/ })).toHaveAttribute('href', /jobs\.dou\.ua/);
  await card.getByTestId('match-hide').click();
  await expect(page.getByTestId('job-match').filter({ hasText: title })).toHaveCount(0);
});
```

Обновить `shell.spec.ts`, если тексты/навигация изменились (заголовок «Today» и ссылки навигации должны остаться).

Run: `pnpm db:env && E2E_PORT=3100 pnpm --filter @jp/web test:e2e`
Expected: все тесты PASS на desktop и mobile.

- [ ] **Step 3: CI**

В `.github/workflows/ci.yml`, job `database`, после `supabase start …` и проверки дрейфа типов добавить шаги (по образцу job `e2e`):
```yaml
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: bash scripts/supabase-env.sh
      - run: pnpm --filter @jp/jobs test:integration
```
(Порядок шагов: checkout → setup-cli → pnpm/node → install → `supabase start` → types drift → `supabase test db` → env → integration.)

Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration`
Expected: всё зелёное.

- [ ] **Step 4: Commit**

```bash
git add apps/web .github/workflows/ci.yml
git commit -m "test: add e2e for search settings and today matches; run pipeline integration tests in CI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Критерии готовности плана 2

- [ ] `pnpm lint && pnpm typecheck && pnpm test` — зелёные (core, scrapers, web).
- [ ] `supabase test db` — `001` и `002` зелёные.
- [ ] `pnpm --filter @jp/jobs test:integration` — зелёный.
- [ ] E2E — зелёные на desktop и mobile.
- [ ] Вручную: создать профиль поиска в UI → `pnpm --filter @jp/jobs run-once --force` → на `/en/today` появились реальные вакансии с DOU/Djinni/remote-площадок со ссылками на оригинал.
- [ ] (Если есть ключи Trigger.dev) `pnpm --filter @jp/jobs dev` регистрирует 4 задачи; ручной запуск `schedule-queries` проходит.
- [ ] PR `feat/plan-2-ingestion` → `develop`, CI зелёный.
