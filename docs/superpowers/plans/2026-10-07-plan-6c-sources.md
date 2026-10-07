# План 6c — Новые источники: дошки компаний (ATS), Telegram, категории DOU, «отклик платный»: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Больше хороших вакансий для фронтенда/фулстека: публичные дошки вакансий компаний (Greenhouse, Lever, Ashby, Workable — отклик напрямую в компанию, без платных стен), публичные Telegram-каналы с вакансиями (украинский рынок и джуны), категории DOU (Front End, Node.js, JavaScript) и пометка «отклик платный» для площадок, где кнопка отклика за подпиской.

**Architecture:** Новые `SourceId`: `greenhouse`, `lever`, `ashby`, `workable`, `telegram`. Список конкретных досок/каналов хранится в таблице `source_boards` (seed + автообнаружение из ссылок в уже собранных вакансиях); для каждой включённой доски строится один общий `search_queries` с `params.board` и привязывается ко всем активным профилям, у которых эта площадка включена. Адаптеры берут все вакансии доски, оставляют только технические (`isTechTitle`) и отдают обычный `RawJob` с регионами найма (`regionsFromLocation`). Telegram-посты — `RawJob` с плейсхолдер-компанией; дальше их чистит существующее AI-обогащение (`is_job`, роль, навыки).

**Tech Stack:** TypeScript 6.0.3, Zod 4, cheerio 1.2 (Telegram), Supabase (Postgres + pgTAP), Trigger.dev 4.6.4, Next.js 16, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` — 12.1 (площадки и выбор пользователем), 6.2–6.4 (контракт адаптера, этапы, защита от банов). Дорожная карта: `docs/superpowers/plans/2026-10-01-roadmap.md`.

## Global Constraints

- Все Global Constraints Планов 1–6a (TS 6.0.3, `@jp/`, revoke → grant → RLS, только новые миграции, Zod на границах, messages en/uk/ru с одинаковыми ключами, коммиты заканчиваются `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, без `minimumReleaseAgeExclude`).
- **Только официальные/публичные эндпоинты:** `boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true`, `api.lever.co/v0/postings/<slug>?mode=json`, `api.ashbyhq.com/posting-api/job-board/<slug>`, `apply.workable.com/api/v1/widget/accounts/<slug>`, `t.me/s/<channel>` (публичный предпросмотр канала). NoFluffJobs, Landing.jobs (robots.txt запрещает `/api/`), Bulldogjob/theprotocol (403) — не подключаются.
- Интервал опроса: ATS ≥ 360 мин, Telegram ≥ 180 мин; одна очередь на источник (`concurrencyLimit: 1`, как у всех).
- Из ATS-досок сохраняются только технические вакансии: `isTechTitle(title)`.
- Регионы найма с ATS — authoritative (`remoteRegions` через `regionsFromLocation`), как в Плане 6a.
- Доска, вернувшая ошибку 3 прогона подряд, выключается (`source_boards.enabled = false`); успешный прогон сбрасывает счётчик.
- Автообнаружение добавляет доску, только если slug проходит `^[a-z0-9][a-z0-9_-]{2,60}$` и API доски вернул ≥ 1 вакансию.
- `source_boards` — служебная таблица: только `service_role` (RLS без политик).
- Площадки, где отклик закрыт подпиской (`remoteok`), помечены в каталоге `applyPaywall: true`; в UI рядом со ссылкой — подсказка «отклик платный — ищите вакансию на сайте компании».

## Структура файлов

```
packages/core/src/jobs/
  job.ts            SOURCE_IDS +5
  sources.ts        каталог +5, applyPaywall, BOARD_SOURCE_IDS
  boards.ts         isTechTitle(), boardQuerySpecs()
  search.ts         DOU categories в buildSourceQueries
supabase/migrations/20261010000100_source_boards.sql
supabase/tests/database/008_source_boards.test.sql
packages/scrapers/src/adapters/{greenhouse,lever,ashby,workable,telegram}.ts, adapters/index.ts
packages/scrapers/fixtures/{greenhouse,lever,ashby,workable}.json, telegram.html
packages/scrapers/scripts/capture-fixtures.mjs
packages/scrapers/test/adapters-boards.test.ts
apps/jobs/src/pipeline/boards.ts            getEnabledBoards, recordBoardRun, discoverBoards
apps/jobs/src/pipeline/sync-profiles.ts     + board specs
apps/jobs/src/pipeline/run-query.ts         + recordBoardRun
apps/jobs/src/trigger/expire-jobs.ts        + discoverBoards
apps/jobs/src/cli/run-once.ts               + --discover
apps/jobs/test/boards.int.test.ts
apps/web/src/app/[locale]/(app)/today/match-detail.tsx, board/card-panel.tsx (paywall hint), messages
```

---

### Task 1: core — каталог, техфильтр, запросы по доскам, категории DOU

**Files:**
- Create: `packages/core/src/jobs/boards.ts`, `packages/core/src/jobs/boards.test.ts`
- Modify: `packages/core/src/jobs/job.ts`, `packages/core/src/jobs/sources.ts`, `packages/core/src/jobs/sources.test.ts`, `packages/core/src/jobs/search.ts`, `packages/core/src/jobs/search.test.ts`, `packages/core/src/index.ts`

**Interfaces:**
- Produces (`@jp/core`):
  - `SOURCE_IDS` += `'greenhouse','lever','ashby','workable','telegram'`.
  - `SourceInfo` += `applyPaywall?: true`; каталог: `greenhouse` (name `Greenhouse boards`, market `global`, url `https://www.greenhouse.com`), `lever` (`Lever boards`, `global`, `https://www.lever.co`), `ashby` (`Ashby boards`, `global`, `https://www.ashbyhq.com`), `workable` (`Workable boards`, `global`, `https://www.workable.com`), `telegram` (`Telegram channels`, `ua`, `https://t.me`); `remoteok` получает `applyPaywall: true`.
  - `BOARD_SOURCE_IDS: ReadonlySet<SourceId>` = `{greenhouse, lever, ashby, workable, telegram}`.
  - `isTechTitle(title: string): boolean`.
  - `type BoardRef = { sourceId: SourceId; slug: string }`; `boardQuerySpecs(boards: BoardRef[], enabled: readonly SourceId[]): SourceQuerySpec[]` (params `{ board: slug }`, тот же `queryKey`, что у остальных запросов).
  - `buildSourceQueries` дополнительно строит до 3 запросов DOU по категориям (`{ category }`) из ключевых слов/навыков профиля.

- [ ] **Step 1: Падающие тесты**

`packages/core/src/jobs/boards.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { boardQuerySpecs, isTechTitle } from './boards';

describe('isTechTitle', () => {
  it('keeps engineering roles and drops the rest', () => {
    for (const t of ['Senior Frontend Engineer', 'Full-Stack Developer (React/Node)', 'Software Engineer, Payments', 'Staff Web Developer', 'React Native Engineer', 'Node.js Backend Engineer', 'TypeScript Developer', 'Front-end розробник', 'Fullstack разработчик']) {
      expect(isTechTitle(t), t).toBe(true);
    }
    for (const t of ['Account Executive - France', 'Recruiter', 'Product Marketing Manager', 'Customer Success Manager', 'Legal Counsel']) {
      expect(isTechTitle(t), t).toBe(false);
    }
  });
});

describe('boardQuerySpecs', () => {
  it('builds one query per board of an enabled source', () => {
    const specs = boardQuerySpecs(
      [
        { sourceId: 'greenhouse', slug: 'gitlab' },
        { sourceId: 'ashby', slug: 'supabase' },
        { sourceId: 'telegram', slug: 'job_it_junior' },
      ],
      ['greenhouse', 'telegram', 'dou'],
    );
    expect(specs.map((s) => [s.sourceId, s.params])).toEqual([
      ['greenhouse', { board: 'gitlab' }],
      ['telegram', { board: 'job_it_junior' }],
    ]);
    expect(specs[0]!.queryKey).toBe('greenhouse:{"board":"gitlab"}');
  });
});
```

В `packages/core/src/jobs/sources.test.ts` добавить:
```ts
  it('marks paywalled apply and lists board sources', () => {
    expect(sourceInfo('remoteok')?.applyPaywall).toBe(true);
    expect(sourceInfo('dou')?.applyPaywall).toBeUndefined();
    expect([...BOARD_SOURCE_IDS].sort()).toEqual(['ashby', 'greenhouse', 'lever', 'telegram', 'workable']);
    expect(defaultSources('remote')).toEqual(expect.arrayContaining(['greenhouse', 'ashby', 'telegram']));
  });
```
(импорт `BOARD_SOURCE_IDS` добавить в этот тест-файл.)

В `packages/core/src/jobs/search.test.ts` добавить:
```ts
describe('DOU categories', () => {
  it('adds category feeds from keywords and skills', () => {
    const specs = buildSourceQueries({ keywords: ['full stack'], skills: ['React', 'Node.js'], remoteType: 'remote', sources: ['dou'] });
    expect(specs.filter((s) => s.params.category).map((s) => s.params.category)).toEqual(['Front End', 'Node.js', 'JavaScript']);
  });
  it('adds none for unrelated profiles', () => {
    const specs = buildSourceQueries({ keywords: ['accountant'], skills: ['Excel'], remoteType: 'office', sources: ['dou'] });
    expect(specs.some((s) => s.params.category)).toBe(false);
  });
});
```

Run: `pnpm --filter @jp/core test` → FAIL.

- [ ] **Step 2: Реализация**

`packages/core/src/jobs/job.ts` — в `SOURCE_IDS` дописать `'greenhouse', 'lever', 'ashby', 'workable', 'telegram'`.

`packages/core/src/jobs/sources.ts`:
- в тип `SourceInfo` добавить `/** The board's apply button needs a paid subscription; point users to the company site. */ applyPaywall?: true;`
- у `remoteok` добавить `applyPaywall: true`;
- в каталог добавить:
```ts
  { id: 'telegram', name: 'Telegram channels', market: 'ua', url: 'https://t.me' },
  { id: 'greenhouse', name: 'Greenhouse boards', market: 'global', url: 'https://www.greenhouse.com' },
  { id: 'lever', name: 'Lever boards', market: 'global', url: 'https://www.lever.co' },
  { id: 'ashby', name: 'Ashby boards', market: 'global', url: 'https://www.ashbyhq.com' },
  { id: 'workable', name: 'Workable boards', market: 'global', url: 'https://www.workable.com' },
```
- экспорт:
```ts
/** Sources polled per board/channel from source_boards rather than per search keyword. */
export const BOARD_SOURCE_IDS: ReadonlySet<SourceId> = new Set<SourceId>(['greenhouse', 'lever', 'ashby', 'workable', 'telegram']);
```

`packages/core/src/jobs/boards.ts`:
```ts
import type { SourceId } from './job';
import type { SourceQuerySpec } from './search';

const TECH = /\b(engineer|engineering|developer|dev|programmer|swe|sre|devops|front[- ]?end|back[- ]?end|full[- ]?stack|software|web|react|angular|vue|node(\.js)?|typescript|javascript|mobile|ios|android|qa|tester|architect|data|ml|ai)\b|розробник|разработчик|програміст|программист|інженер|инженер/i;

/** Board feeds return every role a company has; keep the technical ones. */
export function isTechTitle(title: string): boolean {
  return TECH.test(title);
}

export type BoardRef = { sourceId: SourceId; slug: string };

function queryKey(sourceId: SourceId, params: Record<string, string>): string {
  const sorted = Object.fromEntries(Object.keys(params).sort().map((k) => [k, params[k]!]));
  return `${sourceId}:${JSON.stringify(sorted)}`;
}

/** One shared query per board of an enabled source (deduplicated across users by queryKey). */
export function boardQuerySpecs(boards: BoardRef[], enabled: readonly SourceId[]): SourceQuerySpec[] {
  const on = new Set(enabled);
  return boards
    .filter((b) => on.has(b.sourceId))
    .map((b) => {
      const params = { board: b.slug };
      return { sourceId: b.sourceId, params, queryKey: queryKey(b.sourceId, params) };
    });
}
```
(Если в `search.ts` уже есть приватная `queryKey` — экспортировать её и переиспользовать вместо копии, чтобы не дублировать.)

`packages/core/src/jobs/search.ts` — в `buildSourceQueries` после цикла `SEARCH_SOURCES`:
```ts
  const terms = [...profile.keywords, ...profile.skills].map((t) => t.toLowerCase());
  const has = (re: RegExp) => terms.some((t) => re.test(t));
  const categories = [
    has(/front|react|vue|angular|next|full ?stack|javascript|typescript/) ? 'Front End' : null,
    has(/node|nest|express|full ?stack|back ?end/) ? 'Node.js' : null,
    has(/javascript|typescript|full ?stack/) ? 'JavaScript' : null,
  ].filter((c): c is string => c !== null);
  for (const category of categories) add('dou', { category });
```
`packages/core/src/index.ts`: `export * from './jobs/boards';`

- [ ] **Step 3: Тесты и typecheck** — `pnpm --filter @jp/core test && pnpm typecheck` → PASS (если существующий тест `search.test.ts` проверяет точное число запросов DOU — обновить ожидание с учётом категорий).

- [ ] **Step 4: Commit**
```bash
git add packages/core
git commit -m "feat(core): board sources (ATS, Telegram), tech-title filter, DOU categories, paywall flag

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: БД — источники и таблица досок с начальным списком

**Files:**
- Create: `supabase/migrations/20261010000100_source_boards.sql`, `supabase/tests/database/008_source_boards.test.sql`
- Modify: `packages/db/src/database.types.ts`

**Interfaces:**
- Produces: строки `sources` для 5 новых id; таблица `source_boards(source_id text references sources, slug text, name text, enabled boolean default true, origin text check in ('seed','discovered'), failures int default 0, last_ok_at timestamptz, created_at timestamptz default now(), primary key (source_id, slug))`, только `service_role`.

- [ ] **Step 1: Падающий pgTAP**

`supabase/tests/database/008_source_boards.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select is((select count(*)::int from public.sources where id in ('greenhouse','lever','ashby','workable','telegram')), 5, 'five new sources');
select is((select min_interval_minutes from public.sources where id = 'greenhouse'), 360, 'ATS polled rarely');
select is((select min_interval_minutes from public.sources where id = 'telegram'), 180, 'telegram every 3 hours');
select ok((select count(*) from public.source_boards where origin = 'seed') >= 40, 'seed boards present');
select ok(exists (select 1 from public.source_boards where source_id = 'telegram' and slug = 'job_it_junior'), 'Ukrainian junior channel seeded');

set local role authenticated;
select throws_ok($$ select * from public.source_boards $$, '42501', null, 'boards are service-only');

select * from finish();
rollback;
```
Run: `supabase test db` → FAIL.

- [ ] **Step 2: Миграция**

`supabase/migrations/20261010000100_source_boards.sql`:
```sql
-- Plan 6c: company job boards (ATS) and public Telegram channels as sources.
insert into public.sources (id, name, kind, min_interval_minutes) values
  ('greenhouse', 'Greenhouse boards', 'api', 360),
  ('lever', 'Lever boards', 'api', 360),
  ('ashby', 'Ashby boards', 'api', 360),
  ('workable', 'Workable boards', 'api', 360),
  ('telegram', 'Telegram channels', 'html', 180)
on conflict (id) do nothing;

create table public.source_boards (
  source_id text not null references public.sources (id),
  slug text not null check (slug ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{1,60}$'),
  name text,
  enabled boolean not null default true,
  origin text not null default 'seed' check (origin in ('seed', 'discovered')),
  failures int not null default 0,
  last_ok_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (source_id, slug)
);
revoke all on public.source_boards from anon, authenticated;
alter table public.source_boards enable row level security;

-- Seed: verified 2026-10-07 to return jobs from the public API.
insert into public.source_boards (source_id, slug, name) values
  -- Ukrainian product companies
  ('ashby', 'preply', 'Preply'), ('ashby', 'genesis', 'Genesis'), ('ashby', 'headway', 'Headway'),
  ('ashby', 'universe', 'Universe'), ('ashby', 'obrio', 'OBRIO'), ('ashby', 'boosters', 'Boosters'),
  ('lever', 'ajax', 'Ajax Systems'), ('lever', 'kyivstar', 'Kyivstar'), ('lever', 'eleks', 'ELEKS'),
  -- Remote-friendly product companies
  ('greenhouse', 'gitlab', 'GitLab'), ('greenhouse', 'grafanalabs', 'Grafana Labs'), ('greenhouse', 'elastic', 'Elastic'),
  ('greenhouse', 'mongodb', 'MongoDB'), ('greenhouse', 'datadog', 'Datadog'), ('greenhouse', 'contentful', 'Contentful'),
  ('greenhouse', 'samsara', 'Samsara'), ('greenhouse', 'figma', 'Figma'), ('greenhouse', 'intercom', 'Intercom'),
  ('greenhouse', 'twilio', 'Twilio'), ('greenhouse', 'duolingo', 'Duolingo'), ('greenhouse', 'coinbase', 'Coinbase'),
  ('greenhouse', 'discord', 'Discord'), ('greenhouse', 'reddit', 'Reddit'), ('greenhouse', 'cloudflare', 'Cloudflare'),
  ('greenhouse', 'okta', 'Okta'), ('greenhouse', 'mattermost', 'Mattermost'),
  ('lever', 'spotify', 'Spotify'), ('lever', 'outreach', 'Outreach'),
  ('ashby', 'posthog', 'PostHog'), ('ashby', 'supabase', 'Supabase'), ('ashby', 'linear', 'Linear'),
  ('ashby', 'n8n', 'n8n'), ('ashby', 'sentry', 'Sentry'), ('ashby', 'ramp', 'Ramp'), ('ashby', 'notion', 'Notion'),
  ('ashby', 'resend', 'Resend'), ('ashby', 'replit', 'Replit'), ('ashby', 'elevenlabs', 'ElevenLabs'),
  ('ashby', 'cursor', 'Cursor'), ('ashby', 'clickhouse', 'ClickHouse'), ('ashby', 'checkly', 'Checkly'),
  ('ashby', 'infisical', 'Infisical'),
  ('workable', 'modash', 'Modash'), ('workable', 'portswigger', 'PortSwigger'),
  -- Public Telegram channels with job posts
  ('telegram', 'job_it_junior', 'Don''t Panic Junior IT Jobs'), ('telegram', 'itexpert_vacancies', 'ITExpert Vacancies'),
  ('telegram', 'rabotafrontend', 'FrontEnd Работа'), ('telegram', 'job_react', 'React Jobs'),
  ('telegram', 'juno_jobs', 'Juno Jobs'), ('telegram', 'jobs_juniors_remote', 'Remote jobs for juniors')
on conflict do nothing;
```

- [ ] **Step 3:** `supabase migration up --local && supabase test db` → PASS; `pnpm db:types && pnpm typecheck` → PASS. **Не делать `db reset`.**

- [ ] **Step 4: Commit**
```bash
git add supabase packages/db
git commit -m "feat(db): ATS and Telegram sources with a seeded source_boards table

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: scrapers — адаптеры Greenhouse, Lever, Ashby, Workable, Telegram

**Files:**
- Create: `packages/scrapers/src/adapters/{greenhouse,lever,ashby,workable,telegram}.ts`, `packages/scrapers/test/adapters-boards.test.ts`, фикстуры `packages/scrapers/fixtures/{greenhouse,lever,ashby,workable}.json`, `packages/scrapers/fixtures/telegram.html`
- Modify: `packages/scrapers/src/adapters/index.ts`, `packages/scrapers/scripts/capture-fixtures.mjs`

**Interfaces:**
- Consumes: `isTechTitle`, `regionsFromLocation`, `RawJob` (`@jp/core`); `AdapterContext` (`fetchJson`, `fetchText`).
- Produces: `greenhouseAdapter`, `leverAdapter`, `ashbyAdapter`, `workableAdapter`, `telegramAdapter` (каждый: `search({ board }, ctx)`; без `board` → `[]`), зарегистрированы в `ADAPTERS`.

- [ ] **Step 1: Фикстуры** — дописать в `capture-fixtures.mjs` (сохраняют живые ответы, урезанные до 3 технических + 1 нетехнической вакансии, чтобы проверить фильтр):
```js
const pick = (list, isTech) => [...list.filter((j) => isTech(j)).slice(0, 3), ...list.filter((j) => !isTech(j)).slice(0, 1)];
const tech = (t) => /engineer|developer|front|full|software|web/i.test(t ?? '');
fixtures['greenhouse.json'] = async () => { const d = JSON.parse(await get('https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true')); return JSON.stringify({ jobs: pick(d.jobs, (j) => tech(j.title)) }); };
fixtures['lever.json'] = async () => JSON.stringify(pick(JSON.parse(await get('https://api.lever.co/v0/postings/spotify?mode=json')), (j) => tech(j.text)));
fixtures['ashby.json'] = async () => { const d = JSON.parse(await get('https://api.ashbyhq.com/posting-api/job-board/supabase')); return JSON.stringify({ jobs: pick(d.jobs, (j) => tech(j.title)) }); };
fixtures['workable.json'] = async () => { const d = JSON.parse(await get('https://apply.workable.com/api/v1/widget/accounts/modash')); return JSON.stringify({ ...d, jobs: pick(d.jobs, (j) => tech(j.title)) }); };
fixtures['telegram.html'] = async () => get('https://t.me/s/job_it_junior');
```
(Подстроить под существующую структуру скрипта — у него свой реестр фикстур. Если в каком-то фиде нет нетехнической вакансии, оставить только технические и пометить это в отчёте. Workable: если у `modash` 0 вакансий на момент записи — взять `portswigger`.)
Run: `pnpm --filter @jp/scrapers fixtures` (или запустить только нужные фикстуры) — файлы появились.

- [ ] **Step 2: Падающие тесты** — `packages/scrapers/test/adapters-boards.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { ashbyAdapter } from '../src/adapters/ashby';
import { greenhouseAdapter } from '../src/adapters/greenhouse';
import { leverAdapter } from '../src/adapters/lever';
import { telegramAdapter } from '../src/adapters/telegram';
import { workableAdapter } from '../src/adapters/workable';
import { fakeContext } from './fake-context';

const fx = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

async function expectValid(jobs: Awaited<ReturnType<typeof greenhouseAdapter.search>>) {
  expect(jobs.length).toBeGreaterThan(0);
  for (const j of jobs) {
    expect(await normalizeJob(j), j.title).not.toBeNull();
    expect(j.url).toMatch(/^https:\/\//);
  }
}

describe('board adapters', () => {
  it('greenhouse keeps tech roles with board links and regions', async () => {
    const { ctx, calls } = fakeContext({ 'boards-api.greenhouse.io': fx('greenhouse.json') });
    const jobs = await greenhouseAdapter.search({ board: 'gitlab' }, ctx);
    expect(calls[0]!.url).toBe('https://boards-api.greenhouse.io/v1/boards/gitlab/jobs?content=true');
    expect(jobs.every((j) => /engineer|developer|front|full|software|web/i.test(j.title))).toBe(true);
    await expectValid(jobs);
  });
  it('lever', async () => {
    const { ctx, calls } = fakeContext({ 'api.lever.co': fx('lever.json') });
    const jobs = await leverAdapter.search({ board: 'spotify' }, ctx);
    expect(calls[0]!.url).toBe('https://api.lever.co/v0/postings/spotify?mode=json');
    await expectValid(jobs);
  });
  it('ashby', async () => {
    const { ctx, calls } = fakeContext({ 'api.ashbyhq.com': fx('ashby.json') });
    const jobs = await ashbyAdapter.search({ board: 'supabase' }, ctx);
    expect(calls[0]!.url).toBe('https://api.ashbyhq.com/posting-api/job-board/supabase');
    await expectValid(jobs);
  });
  it('workable', async () => {
    const { ctx } = fakeContext({ 'apply.workable.com': fx('workable.json') });
    await expectValid(await workableAdapter.search({ board: 'modash' }, ctx));
  });
  it('telegram turns channel posts into placeholder-company jobs', async () => {
    const { ctx, calls } = fakeContext({ 't.me/s/job_it_junior': fx('telegram.html') });
    const jobs = await telegramAdapter.search({ board: 'job_it_junior' }, ctx);
    expect(calls[0]!.url).toBe('https://t.me/s/job_it_junior');
    expect(jobs.length).toBeGreaterThan(3);
    for (const j of jobs) {
      expect(j.url).toMatch(/^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/);
      expect(j.companyIsPlaceholder).toBe(true);
      expect(j.description!.length).toBeGreaterThan(80);
    }
    await expectValid(jobs);
  });
  it('returns nothing without a board', async () => {
    const { ctx } = fakeContext({});
    expect(await greenhouseAdapter.search({}, ctx)).toEqual([]);
    expect(await telegramAdapter.search({}, ctx)).toEqual([]);
  });
});
```
Run: `pnpm --filter @jp/scrapers test` → FAIL.

- [ ] **Step 3: Адаптеры**

`greenhouse.ts`:
```ts
import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type GhJob = { id: number; title: string; absolute_url: string; location?: { name?: string }; updated_at?: string; first_published?: string; content?: string; company_name?: string };

const decodeHtml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

export const greenhouseAdapter: SourceAdapter = {
  id: 'greenhouse',
  async search(params, ctx) {
    if (!params.board) return [];
    const data = await ctx.fetchJson<{ jobs?: GhJob[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(params.board)}/jobs?content=true`);
    return (data.jobs ?? []).filter((j) => isTechTitle(j.title)).map((j): RawJob => {
      const location = j.location?.name ?? null;
      return {
        externalId: String(j.id),
        url: j.absolute_url,
        title: j.title,
        company: j.company_name ?? params.board!,
        description: decodeHtml(j.content ?? ''),
        location,
        postedAt: j.first_published ?? j.updated_at ?? null,
        remoteHint: /remote/i.test(location ?? '') ? 'remote' : undefined,
        remoteRegions: location ? regionsFromLocation(location.replace(/^remote[,\s-]*/i, '')) : undefined,
      };
    });
  },
};
```
`lever.ts`:
```ts
import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type LeverJob = { id: string; text: string; hostedUrl: string; createdAt?: number; descriptionPlain?: string; additionalPlain?: string; workplaceType?: string; categories?: { location?: string; allLocations?: string[] }; country?: string };

export const leverAdapter: SourceAdapter = {
  id: 'lever',
  async search(params, ctx) {
    if (!params.board) return [];
    const list = await ctx.fetchJson<LeverJob[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(params.board)}?mode=json`);
    return (Array.isArray(list) ? list : []).filter((j) => isTechTitle(j.text)).map((j): RawJob => {
      const locations = j.categories?.allLocations?.length ? j.categories.allLocations : j.categories?.location ? [j.categories.location] : [];
      const remote = j.workplaceType === 'remote';
      return {
        externalId: j.id,
        url: j.hostedUrl,
        title: j.text,
        company: params.board!,
        description: [j.descriptionPlain, j.additionalPlain].filter(Boolean).join('\n\n'),
        location: locations.join(', ') || null,
        postedAt: j.createdAt ?? null,
        remoteHint: remote ? 'remote' : j.workplaceType === 'hybrid' ? 'hybrid' : j.workplaceType === 'onsite' ? 'office' : undefined,
        remoteRegions: remote && locations.length ? regionsFromLocation(locations.map((l) => l.replace(/^remote[,\s-]*/i, ''))) : undefined,
      };
    });
  },
};
```
`ashby.ts`:
```ts
import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type AshbyJob = { id: string; title: string; jobUrl: string; location?: string; secondaryLocations?: { location?: string }[]; isRemote?: boolean; workplaceType?: string; publishedAt?: string; descriptionPlain?: string };

export const ashbyAdapter: SourceAdapter = {
  id: 'ashby',
  async search(params, ctx) {
    if (!params.board) return [];
    const data = await ctx.fetchJson<{ jobs?: AshbyJob[] }>(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(params.board)}`);
    return (data.jobs ?? []).filter((j) => isTechTitle(j.title)).map((j): RawJob => {
      const locations = [j.location, ...(j.secondaryLocations ?? []).map((s) => s.location)].filter((l): l is string => Boolean(l));
      const remote = j.isRemote === true || /remote/i.test(j.workplaceType ?? '');
      return {
        externalId: j.id,
        url: j.jobUrl,
        title: j.title.trim(),
        company: params.board!,
        description: j.descriptionPlain ?? '',
        location: locations.join(', ') || null,
        postedAt: j.publishedAt ?? null,
        remoteHint: remote ? 'remote' : /hybrid/i.test(j.workplaceType ?? '') ? 'hybrid' : undefined,
        remoteRegions: remote && locations.length ? regionsFromLocation(locations.map((l) => l.replace(/^remote[,\s-]*/i, ''))) : undefined,
      };
    });
  },
};
```
`workable.ts`:
```ts
import { isTechTitle, type RawJob, regionsFromLocation } from '@jp/core';
import type { SourceAdapter } from '../types';

type WkJob = { title: string; shortcode: string; url?: string; application_url?: string; telecommuting?: boolean; city?: string; country?: string; published_on?: string; created_at?: string; description?: string };

export const workableAdapter: SourceAdapter = {
  id: 'workable',
  async search(params, ctx) {
    if (!params.board) return [];
    const data = await ctx.fetchJson<{ name?: string; jobs?: WkJob[] }>(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(params.board)}`);
    return (data.jobs ?? []).filter((j) => isTechTitle(j.title)).map((j): RawJob => {
      const location = [j.city, j.country].filter(Boolean).join(', ') || null;
      return {
        externalId: j.shortcode,
        url: j.url ?? `https://apply.workable.com/${params.board}/j/${j.shortcode}/`,
        title: j.title,
        company: data.name || params.board!,
        description: j.description ?? '',
        location,
        postedAt: j.published_on ?? j.created_at ?? null,
        remoteHint: j.telecommuting ? 'remote' : undefined,
        remoteRegions: j.telecommuting && j.country ? regionsFromLocation(j.country) : undefined,
      };
    });
  },
};
```
`telegram.ts`:
```ts
import type { RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

const MIN_TEXT = 80;
const JOBBY = /vacanc|вакансі|ваканс|hiring|шукаємо|ищем|looking for|position|developer|engineer|розробник|разработчик|junior|middle|senior|стаж|intern/i;

/** Public channel preview (t.me/s/<channel>): each post becomes a job candidate; AI enrichment drops non-jobs. */
export const telegramAdapter: SourceAdapter = {
  id: 'telegram',
  async search(params, ctx) {
    const channel = params.board;
    if (!channel || !/^[A-Za-z0-9_]{4,64}$/.test(channel)) return [];
    const $ = load(await ctx.fetchText(`https://t.me/s/${channel}`));
    const channelTitle = $('meta[property="og:title"]').attr('content')?.trim() || channel;
    const jobs: RawJob[] = [];
    $('.tgme_widget_message[data-post]').each((_, el) => {
      const post = $(el).attr('data-post') ?? '';
      const [name, id] = post.split('/');
      const textEl = $(el).find('.tgme_widget_message_text').first();
      textEl.find('br').replaceWith('\n');
      const text = textEl.text().replace(/\n{3,}/g, '\n\n').trim();
      if (!name || !id || !/^\d+$/.test(id) || text.length < MIN_TEXT || !JOBBY.test(text)) return;
      const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l.length > 3) ?? text.slice(0, 80);
      jobs.push({
        externalId: `${name}/${id}`,
        url: `https://t.me/${name}/${id}`,
        title: firstLine.replace(/^[^\p{L}\p{N}]+/u, '').slice(0, 200) || firstLine.slice(0, 200),
        company: channelTitle,
        companyIsPlaceholder: true,
        description: text,
        postedAt: $(el).find('time[datetime]').first().attr('datetime') ?? null,
      });
    });
    return jobs;
  },
};
```
`adapters/index.ts` — зарегистрировать все пять в `ADAPTERS`.

- [ ] **Step 4:** `pnpm --filter @jp/scrapers test && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/scrapers
git commit -m "feat(scrapers): Greenhouse, Lever, Ashby, Workable and Telegram channel adapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Конвейер — запросы по доскам, учёт сбоев, автообнаружение

**Files:**
- Create: `apps/jobs/src/pipeline/boards.ts`, `apps/jobs/test/boards.int.test.ts`
- Modify: `apps/jobs/src/pipeline/sync-profiles.ts`, `apps/jobs/src/pipeline/run-query.ts`, `apps/jobs/src/trigger/expire-jobs.ts`, `apps/jobs/src/cli/run-once.ts`

**Interfaces:**
- Consumes: `boardQuerySpecs`, `BoardRef`, `BOARD_SOURCE_IDS`, `defaultSources` (`@jp/core`); `ADAPTERS` (`@jp/scrapers`); таблица `source_boards`.
- Produces:
  - `getEnabledBoards(db): Promise<BoardRef[]>`.
  - `recordBoardRun(db, sourceId: string, slug: string, ok: boolean): Promise<void>` — ok → `failures = 0, last_ok_at = now()`; fail → `failures + 1`, при `failures >= 3` → `enabled = false`.
  - `discoverBoards(db, deps: { adapters; createContext; now? }): Promise<{ checked: number; added: number }>` — ищет в `job_postings.url` и `jobs.description_text` (вакансии за 14 дней) ссылки `boards.greenhouse.io|job-boards.greenhouse.io/<slug>`, `jobs.lever.co/<slug>`, `jobs.ashbyhq.com/<slug>`, `apply.workable.com/<slug>`; новые slug (regex из Global Constraints) проверяет вызовом адаптера (`search({ board })`, ≥ 1 вакансия без фильтра? — достаточно: адаптер вернул ≥ 1 техническую вакансию) и вставляет `origin = 'discovered'`. Не больше 20 проверок за запуск.

- [ ] **Step 1: Падающий интеграционный тест** — `apps/jobs/test/boards.int.test.ts`:
```ts
import type { SourceAdapter } from '@jp/scrapers';
import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { discoverBoards, getEnabledBoards, recordBoardRun } from '../src/pipeline/boards';

const db = getDb();
const uniq = `${Date.now()}`.slice(-8);
const slug = `testco${uniq}`;

afterAll(async () => {
  await db.from('source_boards').delete().like('slug', `%${uniq}%`);
  await db.from('jobs').delete().like('fingerprint', `boards-${uniq}%`);
});

describe('source boards', () => {
  it('lists enabled seed boards', async () => {
    const boards = await getEnabledBoards(db);
    expect(boards).toEqual(expect.arrayContaining([{ sourceId: 'greenhouse', slug: 'gitlab' }, { sourceId: 'telegram', slug: 'job_it_junior' }]));
  });

  it('disables a board after three failures and resets on success', async () => {
    await db.from('source_boards').insert({ source_id: 'lever', slug, origin: 'discovered' });
    await recordBoardRun(db, 'lever', slug, false);
    await recordBoardRun(db, 'lever', slug, true);
    for (let i = 0; i < 3; i++) await recordBoardRun(db, 'lever', slug, false);
    const { data } = await db.from('source_boards').select('enabled, failures').eq('source_id', 'lever').eq('slug', slug).single();
    expect(data).toEqual({ enabled: false, failures: 3 });
  });

  it('discovers a new board from a posting link and verifies it', async () => {
    const found = `found${uniq}`;
    const { data: company } = await db.from('companies').insert({ name: `B ${uniq}`, normalized_name: `boards ${uniq}` }).select('id').single();
    const { data: job } = await db
      .from('jobs')
      .insert({ fingerprint: `boards-${uniq}`, title: 'Frontend Engineer', company_id: company!.id, description_text: `Apply: https://jobs.ashbyhq.com/${found}/abc` })
      .select('id')
      .single();
    await db.from('job_postings').insert({ job_id: job!.id, source_id: 'remotive', external_id: `boards-${uniq}`, url: 'https://remotive.com/x' });
    const ashby: SourceAdapter = { id: 'ashby', search: async (p) => (p.board === found ? [{ externalId: '1', url: 'https://jobs.ashbyhq.com/x/1', title: 'Frontend Engineer', company: 'X' }] : []) };
    const res = await discoverBoards(db, { adapters: { ashby } as never, createContext: () => ({}) as never });
    expect(res.added).toBeGreaterThanOrEqual(1);
    const { data } = await db.from('source_boards').select('origin, enabled').eq('source_id', 'ashby').eq('slug', found).single();
    expect(data).toEqual({ origin: 'discovered', enabled: true });
  });
});
```
Run: `pnpm --filter @jp/jobs test:integration -- boards` → FAIL.

- [ ] **Step 2: `pipeline/boards.ts`**
```ts
import { type BoardRef, BOARD_SOURCE_IDS, type SourceId } from '@jp/core';
import type { AdapterContext, SourceAdapter } from '@jp/scrapers';
import type { Db } from '../db';

const SLUG = /^[a-z0-9][a-z0-9_-]{2,60}$/;
const PATTERNS: [SourceId, RegExp][] = [
  ['greenhouse', /(?:boards|job-boards)\.greenhouse\.io\/([a-z0-9_-]+)/gi],
  ['lever', /jobs\.lever\.co\/([a-z0-9_-]+)/gi],
  ['ashby', /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/gi],
  ['workable', /apply\.workable\.com\/([a-z0-9_-]+)/gi],
];
const MAX_CHECKS = 20;

export async function getEnabledBoards(db: Db): Promise<BoardRef[]> {
  const { data, error } = await db.from('source_boards').select('source_id, slug').eq('enabled', true);
  if (error) throw error;
  return data
    .filter((b) => BOARD_SOURCE_IDS.has(b.source_id as SourceId))
    .map((b) => ({ sourceId: b.source_id as SourceId, slug: b.slug }));
}

export async function recordBoardRun(db: Db, sourceId: string, slug: string, ok: boolean): Promise<void> {
  if (ok) {
    await db.from('source_boards').update({ failures: 0, last_ok_at: new Date().toISOString() }).eq('source_id', sourceId).eq('slug', slug);
    return;
  }
  const { data } = await db.from('source_boards').select('failures').eq('source_id', sourceId).eq('slug', slug).maybeSingle();
  if (!data) return;
  const failures = data.failures + 1;
  await db.from('source_boards').update({ failures, enabled: failures < 3 }).eq('source_id', sourceId).eq('slug', slug);
}

export async function discoverBoards(
  db: Db,
  deps: { adapters: Record<string, SourceAdapter>; createContext: (sourceId: string) => AdapterContext; now?: () => Date },
): Promise<{ checked: number; added: number }> {
  const since = new Date((deps.now?.() ?? new Date()).getTime() - 14 * 24 * 3600 * 1000).toISOString();
  const { data: jobs, error } = await db.from('jobs').select('description_text, job_postings(url)').gte('first_seen_at', since).limit(5000);
  if (error) throw error;
  const { data: known } = await db.from('source_boards').select('source_id, slug');
  const seen = new Set((known ?? []).map((b) => `${b.source_id}:${b.slug.toLowerCase()}`));
  const candidates = new Map<string, { sourceId: SourceId; slug: string }>();
  for (const j of jobs) {
    const text = `${j.description_text} ${j.job_postings.map((p) => p.url).join(' ')}`;
    for (const [sourceId, re] of PATTERNS) {
      for (const m of text.matchAll(re)) {
        const slug = m[1]!.toLowerCase();
        const key = `${sourceId}:${slug}`;
        if (SLUG.test(slug) && !seen.has(key)) candidates.set(key, { sourceId, slug });
      }
    }
  }
  let checked = 0;
  let added = 0;
  for (const c of [...candidates.values()].slice(0, MAX_CHECKS)) {
    const adapter = deps.adapters[c.sourceId];
    if (!adapter) continue;
    checked += 1;
    const ctx = deps.createContext(c.sourceId);
    try {
      const found = await adapter.search({ board: c.slug }, ctx);
      if (found.length > 0) {
        const { error: insertError } = await db.from('source_boards').insert({ source_id: c.sourceId, slug: c.slug, origin: 'discovered' });
        if (!insertError) added += 1;
      }
    } catch {
      // not a real board, or the API refused: skip
    } finally {
      await ctx.dispose?.().catch(() => undefined);
    }
  }
  return { checked, added };
}
```

- [ ] **Step 3: Привязка запросов** — `pipeline/sync-profiles.ts`:
- в `linkQueries(db, profile, boards)` добавить параметр `boards: BoardRef[]` и строить `const specs = [...buildSourceQueries(profile), ...boardQuerySpecs(boards, profile.sources ?? defaultSources(profile.remoteType))];`
- `syncProfile` и `syncAllProfiles` один раз загружают `await getEnabledBoards(db)` и передают в `linkQueries`.
- Важно: фильтр `.filter('query_key', 'in', …)` уже экранирует кавычки — новые ключи `greenhouse:{"board":"gitlab"}` через него проходят (проверить тестом из Step 1 существующих `pipeline.int.test.ts`).

- [ ] **Step 4: Учёт сбоев** — `pipeline/run-query.ts`: после успешного прогона и в ветке ошибки, если `query.params.board` есть и `BOARD_SOURCE_IDS.has(source.id)`, вызвать `recordBoardRun(db, source.id, params.board, ok)` (ошибку учёта не пробрасывать).

- [ ] **Step 5: Автообнаружение по расписанию** — `trigger/expire-jobs.ts` после `expireJobs`: `const discovered = await discoverBoards(db, pipelineDeps());` и в лог/результат. `cli/run-once.ts`: флаг `--discover` вызывает `discoverBoards` и печатает результат.

- [ ] **Step 6:** `pnpm --filter @jp/jobs typecheck && pnpm --filter @jp/jobs test:integration` → PASS (все прежние тесты тоже).

- [ ] **Step 7: Commit**
```bash
git add apps/jobs
git commit -m "feat(jobs): poll company boards and Telegram channels, auto-disable failing boards, discover new boards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Веб — подсказка «отклик платный», новые площадки в «Где искать»

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/today/match-detail.tsx`, `apps/web/src/app/[locale]/(app)/board/card-panel.tsx` (если там есть ссылка на оригинал с источником), `apps/web/messages/{en,uk,ru}.json`, `apps/web/e2e/feed.spec.ts`, `apps/web/e2e/search.spec.ts`, `apps/web/e2e/helpers/seed.ts`

**Interfaces:**
- Consumes: `sourceInfo(id).applyPaywall` (`@jp/core`).
- Produces: test id `paid-apply` рядом со ссылкой площадки с `applyPaywall`.

- [ ] **Step 1:** В `match-detail.tsx` у каждой ссылки «Открыть на …» для площадки с `sourceInfo(p.sourceId)?.applyPaywall` добавить после ссылки:
```tsx
<span data-testid="paid-apply" className="font-mono text-xs text-warning" title={t('paidApplyHint')}>
  {t('paidApply')}
</span>
```
Сообщения в `today`: en `"paidApply": "paid apply"`, `"paidApplyHint": "This board asks for a subscription to apply — find the job on the company's own site instead."`; uk `"paidApply": "платний відгук"`, `"paidApplyHint": "Цей майданчик просить підписку для відгуку — знайдіть вакансію на сайті компанії."`; ru `"paidApply": "платный отклик"`, `"paidApplyHint": "Эта площадка просит подписку для отклика — найдите вакансию на сайте компании."`.

- [ ] **Step 2:** «Где искать» (`/search`) строится из `SOURCE_CATALOG` — убедиться, что 5 новых площадок появились в своих группах (ua/global). Если у формы есть описания площадок в messages по id — добавить для новых id во все три локали.

- [ ] **Step 3: E2E**
- `helpers/seed.ts`: `seedMatch` получает опцию `sourceId?: string` (по умолчанию `'dou'`) и `url?` для posting.
- `feed.spec.ts`: тест — матч с posting `remoteok` показывает `paid-apply` (desktop — в `match-detail`; mobile — после «Details»), матч с `dou` — не показывает.
- `search.spec.ts`: у нового профиля видны чекбоксы `source-greenhouse`, `source-telegram`; в существующем тесте выбора подмножества площадок добавить новые id в список снимаемых.

- [ ] **Step 4:** `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS (пользовательский сервер работает из отдельного worktree на :3200 и не мешает).

- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): flag paid-apply boards and list company-board and Telegram sources

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Документация и полный прогон

- [ ] **Step 1:** Роадмап: добавить строку `| **6c. Новые источники** | Дошки компаний (Greenhouse, Lever, Ashby, Workable), Telegram-каналы, категории DOU, «отклик платный» | 12.1 | ✅ PR #9 |` после строки Плана 6.
- [ ] **Step 2:** Спека 12.1 — дописать строку: «Реализация 6c: дошки компаний (ATS) и Telegram-каналы опрашиваются по таблице `source_boards` (seed + автообнаружение из ссылок в вакансиях, выключение после 3 сбоев подряд); NoFluffJobs и Landing.jobs не подключаются (robots.txt запрещает API); Remote OK помечен «отклик платный».»
- [ ] **Step 3:** README, раздел про источники: одна строка о `source_boards` и `run-once --discover`.
- [ ] **Step 4:** `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
- [ ] **Step 5: Commit**
```bash
git add docs README.md
git commit -m "docs: plan 6c status and source boards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
