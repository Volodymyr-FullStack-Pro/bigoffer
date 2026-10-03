# План 3 — Новые площадки и выбор галочками: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить 7 площадок (Work.ua и OLX через headless-браузер, LinkedIn-бета, Arbeitnow, Jobicy, Working Nomads, Just Join IT) и дать пользователю выбирать галочками, какие площадки опрашиваются для каждого профиля поиска.

**Architecture:** Каталог площадок (`SOURCE_CATALOG`: название, рынок, бета, нужен ли ключ/браузер) живёт в `packages/core` и используется везде (query builder, UI, подписи источников). `search_profiles.sources` хранит выбор пользователя; `buildSourceQueries` строит запросы только для выбранных площадок. В `packages/scrapers` появляется `PageRenderer` на Playwright (ленивый запуск Chromium, те же паузы, что у HTTP), доступный адаптерам через `ctx.renderPage`, и `ctx.dispose()` для закрытия браузера; HTML разбирается cheerio. Trigger.dev получает build-расширение `playwright()`.

**Tech Stack:** TypeScript 6.0.3, Zod 4, Vitest 5, cheerio 1.2, Playwright 1.63 (Chromium), Trigger.dev 4.6.4 (+ `@trigger.dev/build`), Supabase, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` — раздел 12.1 (и 12.6 — «пароли не храним»). Дорожная карта: `docs/superpowers/plans/2026-10-01-roadmap.md`.

## Global Constraints

- Все Global Constraints Планов 1–2 (TS 6.0.3, `@jp/` scope, конвенция БД revoke → grant → RLS, Zod на границах, typed + parity-tested messages en/uk/ru, коммиты с `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`).
- Новые `SourceId`: `workua`, `olx`, `linkedin`, `arbeitnow`, `jobicy`, `workingnomads`, `justjoin`. Итого 16 площадок.
- **LinkedIn — бета, выключена по умолчанию**, в UI с предупреждением; только публичный guest-endpoint без логина; интервал ≥ 240 мин. Логины/пароли площадок не запрашиваются и не хранятся.
- **По умолчанию** (если профиль не выбирал явно): `office`/`hybrid` → площадки рынков `ua` + `global` (кроме бета); `remote`/`any` → все не-бета.
- Браузерные площадки (`workua`, `olx`) — интервал ≥ 180 мин, не более одной вкладки за раз на источник, пауза 1–4 с между страницами, 403/429 → `SourceBlockedError`.
- Адаптер, которому нужен браузер, без `ctx.renderPage` бросает понятную ошибку (не падает молча).
- Источники без реального названия компании ставят `companyIsPlaceholder: true` (как в Плане 2).
- Атрибуция: название площадки в UI берётся из `SOURCE_CATALOG`.

## Структура файлов

```
packages/core/src/jobs/
  job.ts            (SOURCE_IDS +7)
  sources.ts        SOURCE_CATALOG, SourceMarket, SourceInfo, sourceInfo(), defaultSources(), BROWSER_SOURCE_IDS
  search.ts         sources в схеме/типе; buildSourceQueries учитывает выбор и новые площадки
  dates.ts          parseUkDate (для Work.ua)
packages/scrapers/
  src/types.ts      AdapterContext.renderPage?/dispose?, PageRenderer
  src/http.ts       createHttpContext(opts, env, renderer?) — общий pacing для fetch и render
  src/browser.ts    createPlaywrightRenderer()
  src/adapters/{arbeitnow,jobicy,workingnomads,justjoin,linkedin,workua,olx}.ts
  scripts/capture-fixtures.mjs (+ новые источники, браузерные через Playwright)
supabase/migrations/20261005000100_more_sources.sql
supabase/tests/database/004_more_sources.test.sql
apps/jobs/  runtime.ts (renderer), pipeline/run-query.ts (dispose), pipeline/repository.ts (sources), trigger.config.ts (playwright), trigger/schedule-queries.ts (machine)
apps/web/   search form «Где искать», today card labels из каталога, messages
```

---

### Task 1: core — каталог площадок, выбор по умолчанию, query builder

**Files:**
- Create: `packages/core/src/jobs/sources.ts`, `packages/core/src/jobs/dates.ts`
- Modify: `packages/core/src/jobs/job.ts` (SOURCE_IDS), `packages/core/src/jobs/search.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/jobs/sources.test.ts`, `packages/core/src/jobs/dates.test.ts`, `packages/core/src/jobs/search.test.ts` (дополнить)

**Interfaces:**
- Produces:
  - `SOURCE_IDS` = прежние 9 + `'workua','olx','linkedin','arbeitnow','jobicy','workingnomads','justjoin'`.
  - `type SourceMarket = 'ua' | 'remote' | 'europe' | 'global'`; `type SourceInfo = { id: SourceId; name: string; market: SourceMarket; url: string; beta?: true; requiresKey?: string; browser?: true }`; `SOURCE_CATALOG: readonly SourceInfo[]` (ровно по одной записи на каждый SourceId); `sourceInfo(id: string): SourceInfo | undefined`; `BROWSER_SOURCE_IDS: ReadonlySet<SourceId>`; `defaultSources(remoteType: 'any' | 'remote' | 'hybrid' | 'office'): SourceId[]`.
  - `parseUkDate(text: string): Date | null` — «2 жовтня 2026» / «2 октября 2026» → UTC-полночь этой даты.
  - `searchProfileInputSchema` + поле `sources: SourceId[]` (1..30, только из SOURCE_IDS); `SearchProfile.sources: SourceId[] | null` (null = значения по умолчанию).
  - `buildSourceQueries(profile: Pick<SearchProfile, 'keywords' | 'skills' | 'remoteType' | 'sources'>)` — строит запросы только для `profile.sources ?? defaultSources(profile.remoteType)`.

- [ ] **Step 1: Падающие тесты**

`packages/core/src/jobs/sources.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from './job';
import { BROWSER_SOURCE_IDS, defaultSources, SOURCE_CATALOG, sourceInfo } from './sources';

describe('SOURCE_CATALOG', () => {
  it('has exactly one entry per source id', () => {
    expect(SOURCE_CATALOG.map((s) => s.id).sort()).toEqual([...SOURCE_IDS].sort());
  });
  it('marks LinkedIn as beta and Jooble as needing a key', () => {
    expect(sourceInfo('linkedin')?.beta).toBe(true);
    expect(sourceInfo('jooble')?.requiresKey).toBe('JOOBLE_API_KEY');
    expect(sourceInfo('nope')).toBeUndefined();
  });
  it('lists browser sources', () => {
    expect([...BROWSER_SOURCE_IDS].sort()).toEqual(['olx', 'workua']);
  });
});

describe('defaultSources', () => {
  it('uses Ukrainian and global boards for office/hybrid', () => {
    const office = defaultSources('office');
    expect(office).toContain('workua');
    expect(office).toContain('jooble');
    expect(office).not.toContain('remoteok');
    expect(office).not.toContain('linkedin');
    expect(defaultSources('hybrid')).toEqual(office);
  });
  it('uses every non-beta board for remote and any', () => {
    const remote = defaultSources('remote');
    expect(remote).toContain('djinni');
    expect(remote).toContain('justjoin');
    expect(remote).not.toContain('linkedin');
    expect(defaultSources('any')).toEqual(remote);
  });
});
```

`packages/core/src/jobs/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseUkDate } from './dates';

describe('parseUkDate', () => {
  it('parses Ukrainian and Russian month names', () => {
    expect(parseUkDate('вакансія від 2 жовтня 2026')?.toISOString()).toBe('2026-10-02T00:00:00.000Z');
    expect(parseUkDate('15 октября 2026')?.toISOString()).toBe('2026-10-15T00:00:00.000Z');
    expect(parseUkDate('1 січня 2027')?.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it('returns null when no date', () => {
    expect(parseUkDate('сьогодні')).toBeNull();
  });
});
```

В `packages/core/src/jobs/search.test.ts` дополнить:
```ts
describe('buildSourceQueries with source selection', () => {
  const base = { keywords: ['full stack'], skills: ['React'], remoteType: 'remote' as const };

  it('only builds queries for selected sources', () => {
    const specs = buildSourceQueries({ ...base, sources: ['dou', 'workua'] });
    expect([...new Set(specs.map((s) => s.sourceId))].sort()).toEqual(['dou', 'workua']);
  });

  it('falls back to defaults when sources is null', () => {
    const ids = new Set(buildSourceQueries({ ...base, sources: null }).map((s) => s.sourceId));
    expect(ids.has('linkedin')).toBe(false);
    expect(ids.has('justjoin')).toBe(true);
  });

  it('builds params for new sources', () => {
    const specs = buildSourceQueries({
      ...base,
      sources: ['workua', 'olx', 'linkedin', 'jobicy', 'arbeitnow', 'workingnomads', 'justjoin'],
    });
    const p = (id: string) => specs.filter((s) => s.sourceId === id).map((s) => s.params);
    expect(p('workua')).toEqual([{ search: 'full stack', remote: '1' }]);
    expect(p('olx')).toEqual([{ search: 'full stack' }]);
    expect(p('linkedin')).toEqual([{ keywords: 'full stack', location: 'Worldwide', remote: '1' }]);
    expect(p('jobicy')).toEqual([{ tag: 'full stack' }]);
    expect(p('arbeitnow')).toEqual([{}]);
    expect(p('workingnomads')).toEqual([{}]);
    expect(p('justjoin')).toEqual([{}]);
  });

  it('targets Ukraine on LinkedIn and office Work.ua for office profiles', () => {
    const specs = buildSourceQueries({ ...base, remoteType: 'office', sources: ['workua', 'linkedin'] });
    expect(specs.find((s) => s.sourceId === 'workua')!.params).toEqual({ search: 'full stack' });
    expect(specs.find((s) => s.sourceId === 'linkedin')!.params).toEqual({ keywords: 'full stack', location: 'Ukraine' });
  });
});
```
Существующие тесты `buildSourceQueries` передают только `{ keywords, skills }` — обновить их, добавив `remoteType: 'any', sources: null` (поведение для старых 9 источников должно остаться прежним, кроме того, что `jooble` попадает в default).

Run: `pnpm --filter @jp/core test`
Expected: FAIL — `Failed to resolve import "./sources"` / `"./dates"`.

- [ ] **Step 2: Реализация**

`packages/core/src/jobs/job.ts` — расширить:
```ts
export const SOURCE_IDS = [
  'dou', 'djinni', 'robotaua', 'jooble', 'remoteok', 'remotive', 'himalayas', 'wwr', 'hn',
  'workua', 'olx', 'linkedin', 'arbeitnow', 'jobicy', 'workingnomads', 'justjoin',
] as const;
```

`packages/core/src/jobs/sources.ts`:
```ts
import type { SourceId } from './job';

export type SourceMarket = 'ua' | 'remote' | 'europe' | 'global';

export type SourceInfo = {
  id: SourceId;
  name: string;
  market: SourceMarket;
  url: string;
  beta?: true;
  requiresKey?: string;
  browser?: true;
};

export const SOURCE_CATALOG: readonly SourceInfo[] = [
  { id: 'dou', name: 'DOU', market: 'ua', url: 'https://jobs.dou.ua' },
  { id: 'djinni', name: 'Djinni', market: 'ua', url: 'https://djinni.co' },
  { id: 'workua', name: 'Work.ua', market: 'ua', url: 'https://www.work.ua', browser: true },
  { id: 'robotaua', name: 'robota.ua', market: 'ua', url: 'https://robota.ua' },
  { id: 'olx', name: 'OLX Робота', market: 'ua', url: 'https://www.olx.ua/uk/rabota/', browser: true },
  { id: 'jooble', name: 'Jooble', market: 'global', url: 'https://jooble.org', requiresKey: 'JOOBLE_API_KEY' },
  { id: 'linkedin', name: 'LinkedIn', market: 'global', url: 'https://www.linkedin.com/jobs', beta: true },
  { id: 'remoteok', name: 'Remote OK', market: 'remote', url: 'https://remoteok.com' },
  { id: 'remotive', name: 'Remotive', market: 'remote', url: 'https://remotive.com' },
  { id: 'himalayas', name: 'Himalayas', market: 'remote', url: 'https://himalayas.app' },
  { id: 'wwr', name: 'We Work Remotely', market: 'remote', url: 'https://weworkremotely.com' },
  { id: 'jobicy', name: 'Jobicy', market: 'remote', url: 'https://jobicy.com' },
  { id: 'workingnomads', name: 'Working Nomads', market: 'remote', url: 'https://www.workingnomads.com' },
  { id: 'hn', name: "HN Who's Hiring", market: 'remote', url: 'https://news.ycombinator.com' },
  { id: 'arbeitnow', name: 'Arbeitnow', market: 'europe', url: 'https://www.arbeitnow.com' },
  { id: 'justjoin', name: 'Just Join IT', market: 'europe', url: 'https://justjoin.it' },
];

const BY_ID = new Map<string, SourceInfo>(SOURCE_CATALOG.map((s) => [s.id, s]));

export function sourceInfo(id: string): SourceInfo | undefined {
  return BY_ID.get(id);
}

export const BROWSER_SOURCE_IDS: ReadonlySet<SourceId> = new Set(
  SOURCE_CATALOG.filter((s) => s.browser).map((s) => s.id),
);

export function defaultSources(remoteType: 'any' | 'remote' | 'hybrid' | 'office'): SourceId[] {
  const markets: SourceMarket[] =
    remoteType === 'office' || remoteType === 'hybrid' ? ['ua', 'global'] : ['ua', 'remote', 'europe', 'global'];
  return SOURCE_CATALOG.filter((s) => !s.beta && markets.includes(s.market)).map((s) => s.id);
}
```

`packages/core/src/jobs/dates.ts`:
```ts
const MONTHS: Record<string, number> = {
  січня: 0, лютого: 1, березня: 2, квітня: 3, травня: 4, червня: 5,
  липня: 6, серпня: 7, вересня: 8, жовтня: 9, листопада: 10, грудня: 11,
  января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
  июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
};

export function parseUkDate(text: string): Date | null {
  const m = text.toLowerCase().match(/(\d{1,2})\s+([\p{L}]+)\s+(\d{4})/u);
  if (!m) return null;
  const month = MONTHS[m[2]!];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
}
```

`packages/core/src/jobs/search.ts`:
- импорт `import { SENIORITIES, SOURCE_IDS, type SourceId } from './job';` и `import { defaultSources } from './sources';`
- в `searchProfileInputSchema` добавить `sources: z.array(z.enum(SOURCE_IDS)).min(1).max(30),`
- тип:
```ts
export type SearchProfile = Omit<SearchProfileInput, 'id' | 'name' | 'isActive' | 'sources'> & {
  id: string;
  userId: string;
  sources: SourceId[] | null;
};
```
- `SEARCH_SOURCES` дополнить: `['workua', 'search'], ['olx', 'search'], ['jobicy', 'tag']` (порядок не важен); LinkedIn и feed-источники строятся отдельно.
- `buildSourceQueries`:
```ts
export function buildSourceQueries(
  profile: Pick<SearchProfile, 'keywords' | 'skills' | 'remoteType' | 'sources'>,
): SourceQuerySpec[] {
  const enabled = new Set<SourceId>(profile.sources ?? defaultSources(profile.remoteType));
  const remote = profile.remoteType === 'remote';
  const keywords = profile.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 3);
  const specs: SourceQuerySpec[] = [];
  const add = (sourceId: SourceId, params: Record<string, string>) => {
    if (enabled.has(sourceId)) specs.push({ sourceId, params, queryKey: queryKey(sourceId, params) });
  };

  for (const [sourceId, param] of SEARCH_SOURCES) {
    for (const keyword of keywords) {
      add(sourceId, sourceId === 'workua' && remote ? { [param]: keyword, remote: '1' } : { [param]: keyword });
    }
  }
  for (const keyword of keywords) {
    add('linkedin', remote ? { keywords: keyword, location: 'Worldwide', remote: '1' } : { keywords: keyword, location: 'Ukraine' });
  }

  // …существующий блок djinni / remoteok / wwr / hn без изменений (через add)…

  add('arbeitnow', {});
  add('workingnomads', {});
  add('justjoin', {});

  const unique = new Map(specs.map((s) => [s.queryKey, s]));
  return [...unique.values()];
}
```

`packages/core/src/index.ts` — добавить `export * from './jobs/sources';` и `export * from './jobs/dates';`.

- [ ] **Step 3: Тесты и типы**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS. Затем `pnpm typecheck` по всему монорепо: места, где строится `SearchProfile` (`apps/jobs/src/pipeline/repository.ts` `toSearchProfile`, тесты), должны получить `sources` — в этой задаче добавить туда `sources: null` временно (Task 6 подключит колонку) и прогнать `pnpm typecheck` до зелёного.

- [ ] **Step 4: Commit**

```bash
git add packages/core apps/jobs
git commit -m "feat(core): add source catalog, default sources and per-profile source selection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: БД — новые источники и выбор площадок в профиле

**Files:**
- Create: `supabase/migrations/20261005000100_more_sources.sql`, `supabase/tests/database/004_more_sources.test.sql`
- Modify: `supabase/seed.sql`, `packages/db/src/database.types.ts` (регенерация)

**Interfaces:**
- Produces: строки `sources` для 7 новых id (`workua` html 180, `olx` html 180, `linkedin` html 240, `arbeitnow` api 120, `jobicy` api 120, `workingnomads` api 180, `justjoin` api 120); колонка `search_profiles.sources text[]` (null = по умолчанию) с проверками `cardinality(sources) between 1 and 30` и `public.text_array_max_len(sources) <= 32` (функция из Плана 2).

- [ ] **Step 1: Падающий pgTAP**

`supabase/tests/database/004_more_sources.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select is(
  (select count(*)::int from public.sources
   where id in ('workua','olx','linkedin','arbeitnow','jobicy','workingnomads','justjoin')),
  7, 'seven new sources exist');
select is((select min_interval_minutes from public.sources where id = 'linkedin'), 240, 'linkedin polls rarely');

insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'src@test.dev');
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok($$ insert into public.search_profiles (user_id, name, keywords, sources)
  values ('55555555-5555-5555-5555-555555555555', 'A', '{react}', '{dou,workua}') $$, 'sources can be chosen');
select throws_ok($$ insert into public.search_profiles (user_id, name, keywords, sources)
  values ('55555555-5555-5555-5555-555555555555', 'B', '{react}', '{}') $$, '23514', null, 'empty source list rejected');
select lives_ok($$ insert into public.search_profiles (user_id, name, keywords)
  values ('55555555-5555-5555-5555-555555555555', 'C', '{react}') $$, 'null sources means defaults');

select * from finish();
rollback;
```

Run: `supabase test db`
Expected: FAIL на `004` (`seven new sources exist` = 0 / колонка отсутствует).

- [ ] **Step 2: Миграция и seed**

`supabase/migrations/20261005000100_more_sources.sql`:
```sql
-- Plan 3: more job boards and per-profile source selection.
insert into public.sources (id, name, kind, min_interval_minutes) values
  ('workua', 'Work.ua', 'html', 180),
  ('olx', 'OLX Робота', 'html', 180),
  ('linkedin', 'LinkedIn (guest, beta)', 'html', 240),
  ('arbeitnow', 'Arbeitnow', 'api', 120),
  ('jobicy', 'Jobicy', 'api', 120),
  ('workingnomads', 'Working Nomads', 'api', 180),
  ('justjoin', 'Just Join IT', 'api', 120)
on conflict (id) do nothing;

alter table public.search_profiles add column sources text[];
alter table public.search_profiles
  add constraint search_profiles_sources_count check (sources is null or cardinality(sources) between 1 and 30),
  add constraint search_profiles_sources_len check (sources is null or public.text_array_max_len(sources) <= 32);
```
(Если `linkedin` уже есть в `sources` из seed Плана 1 как `'LinkedIn (email alerts)'`, kind `email` — миграция должна **обновить** эту строку: `update public.sources set name = 'LinkedIn (guest, beta)', kind = 'html', min_interval_minutes = 240 where id = 'linkedin';` после insert. Проверить seed и добавить update.)

`supabase/seed.sql` — привести строку `linkedin` и добавить 6 новых строк, совпадающих с миграцией (`on conflict do nothing`).

- [ ] **Step 3: Применить, типы**

Run: `supabase db reset && supabase test db && pnpm db:types && pnpm typecheck`
Expected: `001`–`004` ok; типы содержат `search_profiles.sources`.

- [ ] **Step 4: Commit**

```bash
git add supabase packages/db
git commit -m "feat(db): register new job boards and per-profile source selection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: scrapers — браузерный рендерер, `renderPage`/`dispose`, cheerio, фикстуры

**Files:**
- Create: `packages/scrapers/src/browser.ts`
- Modify: `packages/scrapers/src/types.ts`, `packages/scrapers/src/http.ts`, `packages/scrapers/src/index.ts`, `packages/scrapers/package.json`, `packages/scrapers/scripts/capture-fixtures.mjs`
- Test: `packages/scrapers/test/http.test.ts` (дополнить)

**Interfaces:**
- Produces:
  - `interface PageRenderer { render(url: string, opts?: { waitForSelector?: string; timeoutMs?: number }): Promise<string>; close(): Promise<void> }`
  - `AdapterContext` + `renderPage?(url: string, opts?: { waitForSelector?: string }): Promise<string>` и `dispose?(): Promise<void>`
  - `createHttpContext(opts, env?, rendererFactory?: () => Promise<PageRenderer>)` — `renderPage` лениво создаёт рендерер при первом вызове, использует ту же паузу между запросами, что и `fetchText`; `dispose()` закрывает рендерер, если он был создан.
  - `createPlaywrightRenderer(opts: { userAgent: string; locale?: string }): Promise<PageRenderer>` — Chromium headless; 403/429 → `SourceBlockedError`; ждёт `waitForSelector` (не падает, если не дождался).
  - Зависимости `@jp/scrapers`: `cheerio@^1.2.0`, `playwright@1.63.0` (то же, что `@playwright/test` в web).

- [ ] **Step 1: Падающие тесты** (в `packages/scrapers/test/http.test.ts`)

```ts
describe('renderPage', () => {
  it('lazily creates the renderer, paces with fetches and disposes', async () => {
    sleep.mockClear();
    const render = vi.fn(async () => '<html>ok</html>');
    const close = vi.fn(async () => {});
    const factory = vi.fn(async () => ({ render, close }));
    const ctx = createHttpContext(
      { userAgent: 'UA', fetchImpl: fakeFetch(new Response('x')), sleep, random: () => 0, minDelayMs: 1000, maxDelayMs: 1000 },
      {},
      factory,
    );
    await ctx.fetchText('https://a.test/');
    expect(await ctx.renderPage!('https://b.test/', { waitForSelector: '.card' })).toBe('<html>ok</html>');
    await ctx.renderPage!('https://b.test/2');
    expect(factory).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledWith('https://b.test/', { waitForSelector: '.card' });
    expect(sleep).toHaveBeenCalledTimes(2);
    await ctx.dispose!();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('has no renderPage without a factory and dispose is a no-op', async () => {
    const ctx = createHttpContext({ userAgent: 'UA', fetchImpl: fakeFetch(), sleep });
    expect(ctx.renderPage).toBeUndefined();
    await expect(ctx.dispose!()).resolves.toBeUndefined();
  });
});
```

Run: `pnpm --filter @jp/scrapers test http`
Expected: FAIL.

- [ ] **Step 2: Реализация**

`packages/scrapers/src/types.ts` — добавить:
```ts
export interface PageRenderer {
  render(url: string, opts?: { waitForSelector?: string; timeoutMs?: number }): Promise<string>;
  close(): Promise<void>;
}
```
и в `AdapterContext`:
```ts
  /** Present only when the pipeline can run a headless browser for this source. */
  renderPage?(url: string, opts?: { waitForSelector?: string }): Promise<string>;
  /** Releases resources (browser). Always called by the pipeline after a run. */
  dispose?(): Promise<void>;
```

`packages/scrapers/src/http.ts` — сигнатура `createHttpContext(opts, env = {}, rendererFactory?: () => Promise<PageRenderer>)`; вынести паузу в `async function pace()` (`if (requests++ > 0) await sleep(…)`), вызывать её в `request()` и в `renderPage`:
```ts
  let renderer: PageRenderer | undefined;
  const ctx: AdapterContext = {
    env,
    fetchText: …,
    fetchJson: …,
    dispose: async () => {
      if (renderer) await renderer.close();
      renderer = undefined;
    },
  };
  if (rendererFactory) {
    ctx.renderPage = async (url, renderOpts) => {
      await pace();
      renderer ??= await rendererFactory();
      return renderer.render(url, renderOpts);
    };
  }
  return ctx;
```

`packages/scrapers/src/browser.ts`:
```ts
import { type PageRenderer, SourceBlockedError } from './types';

export async function createPlaywrightRenderer(opts: { userAgent: string; locale?: string }): Promise<PageRenderer> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: opts.userAgent, locale: opts.locale ?? 'uk-UA' });
  return {
    async render(url, { waitForSelector, timeoutMs = 30_000 } = {}) {
      const page = await context.newPage();
      try {
        const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        const status = res?.status() ?? 0;
        if (status === 403 || status === 429) throw new SourceBlockedError(status, url);
        if (waitForSelector) await page.waitForSelector(waitForSelector, { timeout: timeoutMs }).catch(() => undefined);
        return await page.content();
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}
```
`packages/scrapers/src/index.ts` — `export * from './browser';`.

Run: `pnpm --filter @jp/scrapers add cheerio@^1.2.0 playwright@1.63.0 && pnpm --filter @jp/scrapers exec playwright install chromium`

- [ ] **Step 3: Фикстуры новых источников**

В `scripts/capture-fixtures.mjs` добавить (API — через `get`, браузерные — через Playwright, LinkedIn — обычный `get`):
```js
'arbeitnow.json': async () => {
  const d = JSON.parse(await get('https://www.arbeitnow.com/api/job-board-api'));
  return JSON.stringify({ ...d, data: d.data.slice(0, 3) }, null, 1);
},
'jobicy.json': async () => {
  const d = JSON.parse(await get('https://jobicy.com/api/v2/remote-jobs?count=3&tag=react'));
  return JSON.stringify({ ...d, jobs: d.jobs.slice(0, 3) }, null, 1);
},
'workingnomads.json': async () => JSON.stringify(JSON.parse(await get('https://www.workingnomads.com/api/exposed_jobs/')).slice(0, 3), null, 1),
'justjoin.json': async () => {
  const d = JSON.parse(await get('https://justjoin.it/api/candidate-api/offers?from=0&itemsCount=3'));
  return JSON.stringify(d, null, 1);
},
'linkedin.html': async () => {
  const html = await get('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react&location=Ukraine&start=0');
  return [...html.matchAll(/<li>[\s\S]*?<\/li>/g)].slice(0, 3).map((m) => m[0]).join('\n');
},
'workua.html': async () => renderTrim('https://www.work.ua/jobs-remote-react/', 'div.card.job-link'),
'olx.html': async () => renderTrim('https://www.olx.ua/uk/rabota/q-react/', '[data-cy="l-card"]'),
```
и хелпер (вверху файла):
```js
import { chromium } from 'playwright';
async function renderTrim(url, selector) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: UA, locale: 'uk-UA' });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector(selector, { timeout: 15000 });
  const cards = await page.$$eval(selector, (els) => els.slice(0, 3).map((e) => e.outerHTML));
  await browser.close();
  return `<html><body>${cards.join('\n')}</body></html>`;
}
```

Run: `pnpm --filter @jp/scrapers fixtures`
Expected: `✓` для всех файлов (старых и 7 новых). Не выдумывать содержимое при ошибке — повторить, затем сообщить.

- [ ] **Step 4: Тесты, типы, commit**

Run: `pnpm --filter @jp/scrapers test && pnpm --filter @jp/scrapers typecheck`
```bash
git add packages/scrapers pnpm-lock.yaml
git commit -m "feat(scrapers): add lazy Playwright renderer, renderPage/dispose and new fixtures

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Адаптеры Arbeitnow, Jobicy, Working Nomads, Just Join IT

**Files:**
- Create: `packages/scrapers/src/adapters/{arbeitnow,jobicy,workingnomads,justjoin}.ts`
- Modify: `packages/scrapers/src/adapters/index.ts`
- Test: `packages/scrapers/test/adapters-api2.test.ts`

**Interfaces:**
- Produces: `arbeitnowAdapter`, `jobicyAdapter`, `workingnomadsAdapter`, `justjoinAdapter: SourceAdapter`.

- [ ] **Step 1: Падающий тест**

`packages/scrapers/test/adapters-api2.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { arbeitnowAdapter } from '../src/adapters/arbeitnow';
import { jobicyAdapter } from '../src/adapters/jobicy';
import { justjoinAdapter } from '../src/adapters/justjoin';
import { workingnomadsAdapter } from '../src/adapters/workingnomads';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

async function allNormalize(jobs: Awaited<ReturnType<typeof arbeitnowAdapter.search>>) {
  expect(jobs.length).toBe(3);
  const normalized = await Promise.all(jobs.map(normalizeJob));
  expect(normalized.every(Boolean)).toBe(true);
  return normalized;
}

describe('arbeitnowAdapter', () => {
  it('decodes double-escaped HTML descriptions', async () => {
    const { ctx, calls } = fakeContext({ 'arbeitnow.com/api': fixture('arbeitnow.json') });
    const jobs = await arbeitnowAdapter.search({}, ctx);
    expect(calls[0]!.url).toBe('https://www.arbeitnow.com/api/job-board-api');
    const [first] = await allNormalize(jobs);
    expect(first!.descriptionText).not.toMatch(/&lt;|<p>/);
  });
});

describe('jobicyAdapter', () => {
  it('maps salary with period', async () => {
    const { ctx, calls } = fakeContext({ 'jobicy.com/api': fixture('jobicy.json') });
    const jobs = await jobicyAdapter.search({ tag: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://jobicy.com/api/v2/remote-jobs?count=50&tag=react');
    await allNormalize(jobs);
    expect(jobs.every((j) => j.remoteHint === 'remote')).toBe(true);
  });
});

describe('workingnomadsAdapter', () => {
  it('uses the numeric id from the URL', async () => {
    const { ctx } = fakeContext({ 'workingnomads.com/api': fixture('workingnomads.json') });
    const jobs = await workingnomadsAdapter.search({}, ctx);
    expect(jobs.every((j) => /^\d+$/.test(j.externalId))).toBe(true);
    await allNormalize(jobs);
  });
});

describe('justjoinAdapter', () => {
  it('prefers the USD salary and tags skills', async () => {
    const { ctx, calls } = fakeContext({ 'justjoin.it/api': fixture('justjoin.json') });
    const jobs = await justjoinAdapter.search({}, ctx);
    expect(calls[0]!.url).toBe('https://justjoin.it/api/candidate-api/offers?from=0&itemsCount=100');
    expect(jobs[0]!.url).toMatch(/^https:\/\/justjoin\.it\/job-offer\//);
    await allNormalize(jobs);
  });
});
```

Run: `pnpm --filter @jp/scrapers test adapters-api2`
Expected: FAIL — missing modules.

- [ ] **Step 2: Реализация**

`packages/scrapers/src/adapters/arbeitnow.ts`:
```ts
import { decodeEntities, type RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type ArbeitnowResponse = {
  data?: {
    slug: string;
    company_name: string;
    title: string;
    description?: string;
    remote?: boolean;
    url: string;
    tags?: string[];
    job_types?: string[];
    location?: string;
    created_at?: number;
  }[];
};

export const arbeitnowAdapter: SourceAdapter = {
  id: 'arbeitnow',
  async search(_params, ctx) {
    const data = await ctx.fetchJson<ArbeitnowResponse>('https://www.arbeitnow.com/api/job-board-api');
    return (data.data ?? []).map(
      (j): RawJob => ({
        externalId: j.slug,
        url: j.url,
        title: j.title,
        company: j.company_name,
        description: decodeEntities(j.description ?? ''),
        location: j.location || null,
        postedAt: j.created_at ?? null,
        remoteHint: j.remote ? 'remote' : undefined,
        tags: [...(j.tags ?? []), ...(j.job_types ?? [])],
      }),
    );
  },
};
```

`packages/scrapers/src/adapters/jobicy.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type JobicyResponse = {
  jobs?: {
    id: number;
    url: string;
    jobTitle: string;
    companyName: string;
    jobGeo?: string;
    jobLevel?: string;
    jobIndustry?: string[];
    jobType?: string[];
    jobDescription?: string;
    jobExcerpt?: string;
    pubDate?: string;
    salaryMin?: number;
    salaryMax?: number;
    salaryCurrency?: string;
    salaryPeriod?: string;
  }[];
};

const PERIOD: Record<string, 'month' | 'year'> = { yearly: 'year', annual: 'year', monthly: 'month' };

export const jobicyAdapter: SourceAdapter = {
  id: 'jobicy',
  async search(params, ctx) {
    const qs = new URLSearchParams({ count: '50' });
    if (params.tag) qs.set('tag', params.tag);
    const data = await ctx.fetchJson<JobicyResponse>(`https://jobicy.com/api/v2/remote-jobs?${qs}`);
    return (data.jobs ?? []).map((j): RawJob => {
      const period = j.salaryPeriod ? PERIOD[j.salaryPeriod] : undefined;
      const hasSalary = (j.salaryMin ?? 0) > 0 && period !== undefined;
      return {
        externalId: String(j.id),
        url: j.url,
        title: j.jobTitle,
        company: j.companyName,
        description: j.jobDescription ?? j.jobExcerpt ?? '',
        location: j.jobGeo?.replace(/\s+/g, ' ').trim() || null,
        salaryRaw: hasSalary ? `${j.salaryMin} - ${j.salaryMax ?? j.salaryMin} ${j.salaryCurrency ?? 'USD'}` : null,
        salaryPeriod: hasSalary ? period : undefined,
        postedAt: j.pubDate ?? null,
        remoteHint: 'remote',
        tags: [...(j.jobIndustry ?? []), ...(j.jobType ?? []), ...(j.jobLevel ? [j.jobLevel] : [])],
      };
    });
  },
};
```
(`URLSearchParams` кодирует пробел как `+`; для `tag` с пробелом это допустимо. Тест проверяет одно слово.)

`packages/scrapers/src/adapters/workingnomads.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type WorkingNomadsJob = {
  url: string;
  title: string;
  description?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  location?: string;
  pub_date?: string;
};

export const workingnomadsAdapter: SourceAdapter = {
  id: 'workingnomads',
  async search(_params, ctx) {
    const data = await ctx.fetchJson<WorkingNomadsJob[]>('https://www.workingnomads.com/api/exposed_jobs/');
    if (!Array.isArray(data)) return [];
    return data.flatMap((j): RawJob[] => {
      const id = j.url.match(/\/(\d+)\/?$/)?.[1];
      if (!id) return [];
      const company = j.company_name?.trim();
      return [
        {
          externalId: id,
          url: j.url,
          title: j.title,
          company: company || 'Working Nomads',
          companyIsPlaceholder: !company,
          description: j.description ?? '',
          location: j.location || null,
          postedAt: j.pub_date ?? null,
          remoteHint: 'remote',
          tags: [...(j.category_name ? [j.category_name] : []), ...(j.tags ? j.tags.split(',').map((t) => t.trim()).filter(Boolean) : [])],
        },
      ];
    });
  },
};
```

`packages/scrapers/src/adapters/justjoin.ts`:
```ts
import type { RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type JustJoinResponse = {
  data?: {
    guid: string;
    slug: string;
    title: string;
    companyName: string;
    city?: string;
    workplaceType?: string;
    experienceLevel?: string;
    publishedAt?: string;
    isOpenToHireUkrainians?: boolean;
    employmentTypes?: { from: number | null; to: number | null; currency: string; unit?: string }[];
    requiredSkills?: { name: string }[];
  }[];
};

const REMOTE: Record<string, 'remote' | 'hybrid' | 'office'> = { remote: 'remote', hybrid: 'hybrid', office: 'office' };
const UNIT: Record<string, 'month' | 'year'> = { Month: 'month', Year: 'year' };

export const justjoinAdapter: SourceAdapter = {
  id: 'justjoin',
  async search(_params, ctx) {
    const data = await ctx.fetchJson<JustJoinResponse>('https://justjoin.it/api/candidate-api/offers?from=0&itemsCount=100');
    return (data.data ?? []).map((j): RawJob => {
      const usd = j.employmentTypes?.find((e) => e.currency === 'USD' && e.from && e.unit && UNIT[e.unit]);
      const skills = (j.requiredSkills ?? []).map((s) => s.name);
      return {
        externalId: j.guid,
        url: `https://justjoin.it/job-offer/${j.slug}`,
        title: j.title,
        company: j.companyName,
        description: skills.length ? `Skills: ${skills.join(', ')}` : '',
        location: j.city || null,
        salaryRaw: usd ? `${Math.round(usd.from!)} - ${Math.round(usd.to ?? usd.from!)} USD` : null,
        salaryPeriod: usd ? UNIT[usd.unit!] : undefined,
        postedAt: j.publishedAt ?? null,
        remoteHint: j.workplaceType ? REMOTE[j.workplaceType] : undefined,
        tags: [
          ...skills,
          ...(j.experienceLevel ? [j.experienceLevel] : []),
          ...(j.isOpenToHireUkrainians ? ['open-to-ukrainians'] : []),
        ],
      };
    });
  },
};
```

`packages/scrapers/src/adapters/index.ts` — зарегистрировать 4 адаптера (`ADAPTERS` типизирован `Record<SourceId, SourceAdapter>` — компилятор потребует все 16; Task 5 добавит оставшиеся 3, поэтому в этой задаче временно добавить для `workua`, `olx`, `linkedin` заглушки, бросающие `new Error('not implemented')`, и убрать их в Task 5).

- [ ] **Step 3: Тесты, commit**

Run: `pnpm --filter @jp/scrapers test && pnpm --filter @jp/scrapers typecheck`
```bash
git add packages/scrapers
git commit -m "feat(scrapers): add Arbeitnow, Jobicy, Working Nomads and Just Join IT adapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Адаптеры LinkedIn (guest), Work.ua и OLX (браузер)

**Files:**
- Create: `packages/scrapers/src/adapters/{linkedin,workua,olx}.ts`
- Modify: `packages/scrapers/src/adapters/index.ts` (убрать заглушки)
- Test: `packages/scrapers/test/adapters-html.test.ts`

**Interfaces:**
- Produces: `linkedinAdapter` (fetchText HTML), `workuaAdapter`, `olxAdapter` (требуют `ctx.renderPage`; без него — `Error('Work.ua requires a browser renderer')` и т.п.); URL-построители `workuaUrl(params)`, `olxUrl(params)`, `linkedinUrl(params)`.

- [ ] **Step 1: Падающий тест**

`packages/scrapers/test/adapters-html.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it, vi } from 'vitest';
import { linkedinAdapter, linkedinUrl } from '../src/adapters/linkedin';
import { olxAdapter, olxUrl } from '../src/adapters/olx';
import { workuaAdapter, workuaUrl } from '../src/adapters/workua';
import type { AdapterContext } from '../src/types';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

function browserContext(html: string) {
  const renderPage = vi.fn(async () => html);
  const ctx: AdapterContext = {
    env: {},
    fetchText: async () => { throw new Error('unexpected fetch'); },
    fetchJson: async () => { throw new Error('unexpected fetch'); },
    renderPage,
  };
  return { ctx, renderPage };
}

describe('URL builders', () => {
  it('builds Work.ua, OLX and LinkedIn search URLs', () => {
    expect(workuaUrl({ search: 'react developer', remote: '1' })).toBe('https://www.work.ua/jobs-remote-react+developer/');
    expect(workuaUrl({ search: 'react' })).toBe('https://www.work.ua/jobs-react/');
    expect(olxUrl({ search: 'full stack' })).toBe('https://www.olx.ua/uk/rabota/q-full-stack/');
    expect(linkedinUrl({ keywords: 'react', location: 'Worldwide', remote: '1' })).toBe(
      'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=react&location=Worldwide&f_WT=2&start=0',
    );
  });
});

describe('linkedinAdapter', () => {
  it('parses guest job cards', async () => {
    const { ctx } = fakeContext({ 'linkedin.com/jobs-guest': fixture('linkedin.html') });
    const jobs = await linkedinAdapter.search({ keywords: 'react', location: 'Ukraine' }, ctx);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.externalId).toMatch(/^\d+$/);
    expect(jobs[0]!.url).toMatch(/^https:\/\/[a-z.]*linkedin\.com\/jobs\/view\/[^?]+$/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('workuaAdapter', () => {
  it('renders the page and parses cards', async () => {
    const { ctx, renderPage } = browserContext(fixture('workua.html'));
    const jobs = await workuaAdapter.search({ search: 'react', remote: '1' }, ctx);
    expect(renderPage).toHaveBeenCalledWith('https://www.work.ua/jobs-remote-react/', { waitForSelector: 'div.card.job-link' });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/www\.work\.ua\/jobs\/\d+\/$/);
    expect(jobs[0]!.company.length).toBeGreaterThan(0);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });

  it('fails clearly without a renderer', async () => {
    const { ctx } = fakeContext({});
    await expect(workuaAdapter.search({ search: 'react' }, ctx)).rejects.toThrow(/browser/i);
  });
});

describe('olxAdapter', () => {
  it('renders the page and parses cards', async () => {
    const { ctx, renderPage } = browserContext(fixture('olx.html'));
    const jobs = await olxAdapter.search({ search: 'react' }, ctx);
    expect(renderPage).toHaveBeenCalledWith('https://www.olx.ua/uk/rabota/q-react/', { waitForSelector: '[data-cy="l-card"]' });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/www\.olx\.ua\/uk\/obyavlenie\//);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});
```

Run: `pnpm --filter @jp/scrapers test adapters-html`
Expected: FAIL — missing modules.

- [ ] **Step 2: Реализация**

`packages/scrapers/src/adapters/linkedin.ts`:
```ts
import type { RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

export function linkedinUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({ keywords: params.keywords ?? '', location: params.location ?? 'Worldwide' });
  if (params.remote === '1') qs.set('f_WT', '2');
  qs.set('start', '0');
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${qs}`;
}

export const linkedinAdapter: SourceAdapter = {
  id: 'linkedin',
  async search(params, ctx) {
    const $ = load(await ctx.fetchText(linkedinUrl(params)));
    const jobs: RawJob[] = [];
    $('div.base-search-card').each((_, el) => {
      const card = $(el);
      const id = card.attr('data-entity-urn')?.match(/jobPosting:(\d+)/)?.[1];
      const href = card.find('a.base-card__full-link').attr('href');
      const title = card.find('.base-search-card__title').text().trim();
      const company = card.find('.base-search-card__subtitle').text().trim();
      if (!id || !href || !title) return;
      jobs.push({
        externalId: id,
        url: href.split('?')[0]!,
        title,
        company: company || 'LinkedIn',
        companyIsPlaceholder: !company,
        description: '',
        location: card.find('.job-search-card__location').text().trim() || null,
        postedAt: card.find('time').attr('datetime') ?? null,
        remoteHint: params.remote === '1' ? 'remote' : undefined,
      });
    });
    return jobs;
  },
};
```

`packages/scrapers/src/adapters/workua.ts`:
```ts
import { parseUkDate, type RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

const CARD = 'div.card.job-link';

export function workuaUrl(params: Record<string, string>): string {
  const slug = encodeURIComponent((params.search ?? '').trim().toLowerCase()).replace(/%20/g, '+');
  return `https://www.work.ua/jobs-${params.remote === '1' ? 'remote-' : ''}${slug}/`;
}

export const workuaAdapter: SourceAdapter = {
  id: 'workua',
  async search(params, ctx) {
    if (!ctx.renderPage) throw new Error('Work.ua requires a browser renderer');
    const $ = load(await ctx.renderPage(workuaUrl(params), { waitForSelector: CARD }));
    const jobs: RawJob[] = [];
    $(CARD).each((_, el) => {
      const card = $(el);
      const link = card.find('h2 a').first();
      const href = link.attr('href');
      const id = href?.match(/\/jobs\/(\d+)\//)?.[1];
      const title = link.text().trim();
      if (!id || !title) return;
      const company = card.find('.glyphicon-company').parent().find('.strong-600').first().text().trim();
      const salary = card.find('.glyphicon-hryvnia-fill').parent().find('.strong-600').first().text().trim();
      const text = card.text().replace(/\s+/g, ' ').trim();
      jobs.push({
        externalId: id,
        url: `https://www.work.ua/jobs/${id}/`,
        title,
        company: company || 'Work.ua',
        companyIsPlaceholder: !company,
        description: text,
        location: null,
        salaryRaw: salary || null,
        salaryPeriod: salary ? 'month' : undefined,
        postedAt: parseUkDate(link.attr('title') ?? '')?.toISOString() ?? null,
        remoteHint: /дистанційно|віддалено/i.test(text) ? 'remote' : undefined,
      });
    });
    return jobs;
  },
};
```

`packages/scrapers/src/adapters/olx.ts`:
```ts
import type { RawJob } from '@jp/core';
import { load } from 'cheerio';
import type { SourceAdapter } from '../types';

const CARD = '[data-cy="l-card"]';

export function olxUrl(params: Record<string, string>): string {
  const slug = (params.search ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  return `https://www.olx.ua/uk/rabota/q-${encodeURIComponent(slug)}/`;
}

export const olxAdapter: SourceAdapter = {
  id: 'olx',
  async search(params, ctx) {
    if (!ctx.renderPage) throw new Error('OLX requires a browser renderer');
    const $ = load(await ctx.renderPage(olxUrl(params), { waitForSelector: CARD }));
    const jobs: RawJob[] = [];
    $(CARD).each((_, el) => {
      const card = $(el);
      const id = card.attr('id');
      const link = card.find('[data-testid="card-title-link"]').first();
      const href = link.attr('href');
      const title = link.text().trim();
      if (!id || !href || !title) return;
      const salary = card.find('p').filter((_, p) => /грн|\$|€/.test($(p).text())).first().text().trim();
      const text = card.text().replace(/\s+/g, ' ').trim();
      jobs.push({
        externalId: id,
        url: new URL(href.split('?')[0]!, 'https://www.olx.ua').toString(),
        title,
        company: 'OLX',
        companyIsPlaceholder: true,
        description: text,
        location: null,
        salaryRaw: salary || null,
        salaryPeriod: /місяц|месяц/i.test(text) ? 'month' : undefined,
        remoteHint: /віддален|дистанційн|удален/i.test(text) ? 'remote' : undefined,
      });
    });
    return jobs;
  },
};
```
Селекторы основаны на разметке от 2026-10-03. Если в захваченной фикстуре компания/зарплата/дата Work.ua или поля OLX лежат иначе — поправить селекторы под фикстуру (тесты на структуру должны проходить), описать в отчёте.

`packages/scrapers/src/adapters/index.ts` — заменить заглушки на `linkedinAdapter`, `workuaAdapter`, `olxAdapter`.

- [ ] **Step 3: Тесты, commit**

Run: `pnpm --filter @jp/scrapers test && pnpm --filter @jp/scrapers typecheck`
```bash
git add packages/scrapers
git commit -m "feat(scrapers): add LinkedIn guest, Work.ua and OLX adapters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Конвейер — браузер в runtime, `dispose`, выбор площадок, Trigger.dev Playwright

**Files:**
- Modify: `apps/jobs/src/runtime.ts`, `apps/jobs/src/pipeline/run-query.ts`, `apps/jobs/src/pipeline/repository.ts`, `apps/jobs/trigger.config.ts`, `apps/jobs/src/trigger/schedule-queries.ts`, `apps/jobs/package.json`
- Test: `apps/jobs/test/pipeline.int.test.ts` (дополнить)

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces:
  - `pipelineDeps()` создаёт контекст с `rendererFactory` только для `BROWSER_SOURCE_IDS` (`createPlaywrightRenderer({ userAgent })`).
  - `runQuery` вызывает `ctx.dispose?.()` в `finally` (ошибка dispose логируется и не маскирует основную).
  - `toSearchProfile` читает `sources` (фильтруя неизвестные id; пустой результат → null); `PROFILE_COLUMNS` включает `sources`.
  - `trigger.config.ts`: `build: { extensions: [playwright({ browsers: ['chromium'] })] }`.
  - `schedule-queries`: для браузерных источников `options.machine = 'small-2x'` (проверить имя опции/значение в типах SDK 4.6.4; если нет — пропустить и описать).

- [ ] **Step 1: Падающие интеграционные тесты** (в `apps/jobs/test/pipeline.int.test.ts`)

```ts
describe('browser sources and source selection', () => {
  it('disposes the adapter context after a run, even on error', async () => {
    const dispose = vi.fn(async () => {});
    const failing: SourceAdapter = { id: 'dou', search: async () => { throw new Error('boom'); } };
    const deps = { db, adapters: { dou: failing }, createContext: () => ({ ...ctx, dispose }), now: () => now };
    await expect(runQuery(deps, douQueryId)).rejects.toThrow('boom');
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('only links queries for the sources the profile selected', async () => {
    const { data: sp } = await db
      .from('search_profiles')
      .insert({ user_id: userId, name: 'UA only', keywords: ['react'], sources: ['dou', 'workua'] })
      .select('id')
      .single();
    const profile = await getProfile(db, sp!.id);
    const { queryIds } = await syncProfile(db, profile!, now);
    const { data } = await db.from('search_queries').select('source_id').in('id', queryIds);
    expect([...new Set(data!.map((q) => q.source_id))].sort()).toEqual(['dou', 'workua']);
  });
});
```
(`vi` импортировать из `vitest`; `ctx`, `douQueryId`, `userId`, `now` — из существующего файла; учесть лимит 5 профилей на пользователя — при необходимости деактивировать/удалить созданный профиль в `afterAll`.)

Run: `pnpm --filter @jp/jobs test:integration`
Expected: FAIL (dispose не вызывается; `sources` не читается).

- [ ] **Step 2: Реализация**

`apps/jobs/src/runtime.ts`:
```ts
import { BROWSER_SOURCE_IDS, type SourceId } from '@jp/core';
import { ADAPTERS, createHttpContext, createPlaywrightRenderer } from '@jp/scrapers';
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
    createContext: (sourceId) =>
      createHttpContext(
        { userAgent: env.SCRAPER_USER_AGENT },
        adapterEnv,
        BROWSER_SOURCE_IDS.has(sourceId as SourceId)
          ? () => createPlaywrightRenderer({ userAgent: env.SCRAPER_USER_AGENT })
          : undefined,
      ),
  };
}
```

`run-query.ts` — создать контекст один раз (`const ctx = deps.createContext(source.id)`) перед `try`, передать в `adapter.search(…, ctx)`, и обернуть весь путь от `search` до конца bookkeeping так, чтобы в `finally` выполнялось:
```ts
    } finally {
      await ctx.dispose?.().catch((e: unknown) => console.error('dispose failed', e));
    }
```
(не менять существующую семантику success/blocked/error.)

`repository.ts`: `PROFILE_COLUMNS` + `sources`; в `toSearchProfile`:
```ts
    sources: (() => {
      const valid = (row.sources ?? []).filter((s): s is SourceId => (SOURCE_IDS as readonly string[]).includes(s));
      return valid.length > 0 ? valid : null;
    })(),
```
(`ProfileRow` + `sources: string[] | null`; убрать временный `sources: null` из Task 1.)

`apps/jobs/package.json`: `pnpm --filter @jp/jobs add -D @trigger.dev/build@4.6.4`.

`trigger.config.ts`:
```ts
import { playwright } from '@trigger.dev/build/extensions/playwright';
// …
  build: { extensions: [playwright({ browsers: ['chromium'] })] },
```

`schedule-queries.ts` — в `options` каждого элемента батча: `...(BROWSER_SOURCE_IDS.has(q.sourceId as SourceId) ? { machine: 'small-2x' as const } : {})`.

- [ ] **Step 3: Проверка**

Run: `pnpm --filter @jp/jobs test:integration && pnpm --filter @jp/jobs typecheck && pnpm typecheck`
Expected: PASS.

Живой прогон новых площадок (локальный Chromium уже установлен в Task 3):
```bash
pnpm --filter @jp/jobs run-once --force --source=workua
pnpm --filter @jp/jobs run-once --force --source=olx
pnpm --filter @jp/jobs run-once --force --source=arbeitnow
pnpm --filter @jp/jobs run-once --force --source=jobicy
pnpm --filter @jp/jobs run-once --force --source=workingnomads
pnpm --filter @jp/jobs run-once --force --source=justjoin
```
Для этого нужен активный профиль с этими площадками: создать через SQL/скрипт демо-профиль (`keywords {react, full stack}`, `skills {React, Node.js, TypeScript}`, `remote_type remote`, `sources` = все 16 кроме `linkedin` и `jooble`) и ещё один с `sources {linkedin}` для однократной проверки `--source=linkedin`. В отчёт — строки результатов по каждому источнику.

- [ ] **Step 4: Commit**

```bash
git add apps/jobs pnpm-lock.yaml
git commit -m "feat(jobs): run browser sources with Playwright, honour per-profile sources, dispose contexts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Веб — «Где искать» в профиле поиска + подписи источников из каталога + E2E

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/search/{actions.ts,search-profile-form.tsx,page.tsx}`, `apps/web/src/app/[locale]/(app)/today/job-match-card.tsx`, `apps/web/messages/{en,uk,ru}.json`
- Test: `apps/web/e2e/search.spec.ts` (дополнить)

**Interfaces:**
- Consumes: `SOURCE_CATALOG`, `defaultSources`, `sourceInfo`, `SOURCE_IDS`.
- Produces:
  - Поле формы `sources` (чекбоксы `name="sources" value=<id>`), сгруппированные по рынку (`ua`, `remote`, `europe`, `global`); у LinkedIn бейдж «beta» и подсказка-предупреждение; у Jooble — «нужен ключ API». По умолчанию отмечены `values.sources ?? defaultSources(values.remoteType)`. Кнопки «Выбрать все»/«Снять все» в группе не обязательны.
  - Сохранение: `sources = formData.getAll('sources')`; пустой выбор → ошибка `sources` (Zod `min(1)`).
  - В `job-match-card.tsx` `SOURCE_LABELS` заменить на `sourceInfo(id)?.name ?? id`.
  - Переводы (`search.*`): `sources`, `sourcesHint`, `market_ua`, `market_remote`, `market_europe`, `market_global`, `beta`, `linkedinWarning`, `needsKey`. Тексты:
    - en: sources «Where to search», sourcesHint «Pick the job boards for this search», market_ua «Ukraine», market_remote «Remote worldwide», market_europe «Europe», market_global «Aggregators», beta «beta», linkedinWarning «LinkedIn public listings, collected rarely and without your account. Off by default.», needsKey «needs API key».
    - uk/ru — естественный перевод.
  - testids: `source-<id>` на каждом чекбоксе.

- [ ] **Step 1: E2E (падающий)** — в `apps/web/e2e/search.spec.ts`:
```ts
test('saves a chosen subset of job boards', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('search-sources'));
  await page.goto('/en/search');
  await page.getByLabel('Role keywords').fill('react');
  await page.getByLabel('Work format').selectOption('remote');
  for (const id of ['remoteok', 'remotive', 'himalayas', 'wwr', 'jobicy', 'workingnomads', 'hn', 'arbeitnow', 'justjoin', 'jooble', 'robotaua', 'olx']) {
    const box = page.getByTestId(`source-${id}`);
    if (await box.isChecked()) await box.uncheck();
  }
  await page.getByTestId('source-linkedin').check();
  await page.getByTestId('search-save').click();
  await expect(page.getByTestId('search-add')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('source-linkedin').first()).toBeChecked();
  await expect(page.getByTestId('source-remoteok').first()).not.toBeChecked();
  await expect(page.getByTestId('source-dou').first()).toBeChecked();
});
```

- [ ] **Step 2: Реализация** — по Interfaces выше (форма: `<fieldset>` на группу с `<legend>`; чекбоксы внутри `<label>`; бейджи; `actions.ts` добавляет `sources` в `safeParse` и в `row` как `sources: p.sources`; `page.tsx` выбирает колонку `sources` и прокидывает в `values`). При смене «Work format» отметки не пересчитываются автоматически (пользователь управляет сам); для нового профиля — `defaultSources('any')`.

- [ ] **Step 3: Проверка**

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web lint && pnpm --filter @jp/web test && pnpm --filter @jp/web build && pnpm db:env && E2E_PORT=3100 pnpm --filter @jp/web test:e2e`
Expected: всё зелёное.

- [ ] **Step 4: Commit**

```bash
git add apps/web
git commit -m "feat(web): let users pick job boards per search profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Критерии готовности плана 3

- [ ] `pnpm lint && pnpm typecheck && pnpm test`, `supabase test db`, `pnpm --filter @jp/jobs test:integration`, E2E — зелёные.
- [ ] Живой `run-once` по каждому из 7 новых источников возвращает `ok` с вакансиями (LinkedIn — разово, через профиль с явной галочкой).
- [ ] В `/search` видны группы площадок; выбор сохраняется; на «Today» подписи источников из каталога.
- [ ] PR `feat/plan-3-sources` → (стек над #3), CI зелёный.
