# План 6d — Обсяг і швидкість: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Більше релевантних вакансій для fullstack/frontend junior–senior і швидша реакція: пошук за всіма ключовими словами профілю та варіантами назв посад, джерело Adzuna (Європа, remote), керування витратами Trigger.dev (дешеві машини, множник частоти), у стрічці «Сьогодні» фільтр «нові за 24 год» і сортування «найсвіжіші».

**Architecture:** `buildSourceQueries` формує до 6 пошукових термінів (ключові слова профілю + варіанти назв посад) замість перших 3 ключових слів. Adzuna — новий API-адаптер з ключем (`ADZUNA_APP_ID` + `ADZUNA_APP_KEY`), запити по країнах `pl, de, gb, nl` з терміном + `remote`. Витрати: задачі без браузера на машині `micro`, браузерні — як зараз; `SCRAPE_INTERVAL_MULTIPLIER` масштабує інтервали опитування. Стрічка: клієнтський фільтр за `postedAt`/`firstSeenAt` і перемикач сортування.

**Tech Stack:** TypeScript 6.0.3, Zod 4, Supabase, Trigger.dev 4.6.4, Next.js 16, Vitest 5, Playwright.

**Spec:** рішення власника в чаті 2026-10-07 (Етап 2 «повного робочого флоу»): Jooble (ключ), Adzuna (ключ), LinkedIn і Work.ua (без ключа); безкоштовні тарифи; швидкий відгук. Базова спека — `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` 12.1, 6.2–6.4; деплой — `docs/superpowers/specs/2026-10-07-deploy-design.md`.

## Global Constraints

- Всі Global Constraints попередніх планів (TS 6.0.3, `@jp/`, revoke → grant → RLS, лише нові міграції, Zod на межах, messages en/uk/ru з однаковими ключами, без нових залежностей, без `minimumReleaseAgeExclude`, локальну БД не скидати).
- Не більше **6** пошукових термінів на профіль; Adzuna — не більше **2** термінів × **4** країни (`pl`, `de`, `gb`, `nl`), інтервал **360** хв.
- Adzuna: лише офіційний API `https://api.adzuna.com/v1/api/jobs/<country>/search/1`; без ключа адаптер вимкнений (`isConfigured`).
- `SCRAPE_INTERVAL_MULTIPLIER` — число ≥ 1, за замовчуванням 1; невалідне значення → 1.
- Браузерні джерела (Work.ua, OLX, LinkedIn) лишаються на поточній машині; решта задач — `micro`.

## Структура файлів

```
packages/core/src/jobs/{job.ts, sources.ts, search.ts, search.test.ts, sources.test.ts}
supabase/migrations/20261012000100_adzuna_source.sql
packages/scrapers/src/adapters/{adzuna.ts, index.ts}, fixtures/adzuna.json, test/adapters-adzuna.test.ts
apps/jobs/src/{env.ts, pipeline/repository.ts (markQueryRun), trigger/*.ts}, apps/jobs/.env.example
apps/web/src/app/[locale]/(app)/today/{feed-filter.ts, feed-filter.test.ts, feed.tsx, feed-types.ts, page.tsx}, messages, e2e/today.spec.ts
docs/deploy.md, docs/superpowers/plans/2026-10-01-roadmap.md
```

---

### Task 1: core — терміни пошуку та Adzuna в каталозі

**Files:** Modify `packages/core/src/jobs/{job.ts, sources.ts, search.ts, search.test.ts, sources.test.ts}`

**Interfaces:**
- Produces: `SOURCE_IDS` += `'adzuna'`; каталог `{ id: 'adzuna', name: 'Adzuna', market: 'europe', url: 'https://www.adzuna.com', requiresKey: 'ADZUNA_APP_ID' }`; `searchTerms(profile): string[]` (експорт); `ADZUNA_COUNTRIES = ['pl','de','gb','nl'] as const`.

- [ ] **Step 1: Падаючі тести** у `search.test.ts`:
```ts
describe('searchTerms', () => {
  it('uses all keywords plus job-title variants, capped at 6', () => {
    expect(searchTerms({ keywords: ['full stack', 'react', 'node.js', 'next.js', 'frontend'], skills: ['TypeScript'] })).toEqual([
      'full stack', 'react', 'node.js', 'next.js', 'frontend', 'full stack developer',
    ]);
  });
  it('adds title variants for short profiles', () => {
    expect(searchTerms({ keywords: ['react'], skills: ['Node.js'] })).toEqual(['react', 'react developer', 'frontend developer', 'node.js developer']);
  });
  it('dedupes case-insensitively and drops blanks', () => {
    expect(searchTerms({ keywords: [' React ', 'react', ''], skills: [] })).toEqual(['react', 'react developer', 'frontend developer']);
  });
});

describe('adzuna queries', () => {
  it('builds 2 terms x 4 countries with remote', () => {
    const specs = buildSourceQueries({ keywords: ['react', 'node.js'], skills: [], remoteType: 'remote', sources: ['adzuna'] });
    expect(specs.map((s) => s.params)).toEqual([
      { what: 'react remote', country: 'pl' }, { what: 'react remote', country: 'de' }, { what: 'react remote', country: 'gb' }, { what: 'react remote', country: 'nl' },
      { what: 'node.js remote', country: 'pl' }, { what: 'node.js remote', country: 'de' }, { what: 'node.js remote', country: 'gb' }, { what: 'node.js remote', country: 'nl' },
    ]);
  });
});
```
Також: тест, що DOU отримує запит для кожного терміна з `searchTerms` (а не лише 3). Оновити існуючі тести, що очікують рівно 3 ключові слова.

- [ ] **Step 2: Реалізація** у `search.ts`:
```ts
const MAX_TERMS = 6;
/** Job-title variants that job boards match better than bare technology names. */
const TITLE_VARIANTS: [RegExp, string[]][] = [
  [/^full ?-?stack$/, ['full stack developer']],
  [/^react(\.js)?$/, ['react developer', 'frontend developer']],
  [/^front ?-?end$/, ['frontend developer']],
  [/^node(\.js)?$/, ['node.js developer']],
  [/^next(\.js)?$/, ['next.js developer']],
  [/^(javascript|js)$/, ['javascript developer']],
  [/^(typescript|ts)$/, ['typescript developer']],
];

/** Search terms for keyword-based sources: the profile's keywords first, then title variants of keywords and skills. */
export function searchTerms(profile: Pick<SearchProfile, 'keywords' | 'skills'>): string[] {
  const out: string[] = [];
  const push = (t: string) => {
    const v = t.trim().toLowerCase();
    if (v && !out.includes(v)) out.push(v);
  };
  for (const k of profile.keywords) push(k);
  for (const t of [...profile.keywords, ...profile.skills]) {
    const key = t.trim().toLowerCase();
    for (const [re, variants] of TITLE_VARIANTS) if (re.test(key)) variants.forEach(push);
  }
  return out.slice(0, MAX_TERMS);
}
```
У `buildSourceQueries`: `const keywords = searchTerms(profile);` замість `profile.keywords…slice(0, 3)`. Adzuna: `export const ADZUNA_COUNTRIES = ['pl', 'de', 'gb', 'nl'] as const;` і після LinkedIn:
```ts
  for (const term of keywords.slice(0, 2)) {
    for (const country of ADZUNA_COUNTRIES) add('adzuna', { what: `${term} remote`, country });
  }
```
(Перевірити, що порядок у тесті «short profiles» відповідає реалізації: ключові слова, потім варіанти в порядку ключових слів → навичок; якщо тест і код розходяться, правильна — реалізація з цього кроку, тест підлаштувати й зазначити у звіті.)
`job.ts`: `'adzuna'` у `SOURCE_IDS`. `sources.ts`: запис каталогу. `sources.test.ts`: `sourceInfo('adzuna')?.requiresKey === 'ADZUNA_APP_ID'`.

- [ ] **Step 3:** `pnpm --filter @jp/core test` → PASS. (`pnpm typecheck` впаде в `@jp/scrapers` на `Record<SourceId, …>` до Task 2 — очікувано.)
- [ ] **Step 4: Commit** `feat(core): search all profile keywords plus job-title variants; Adzuna source`

---

### Task 2: Adzuna — міграція й адаптер

**Files:** Create `supabase/migrations/20261012000100_adzuna_source.sql`, `packages/scrapers/src/adapters/adzuna.ts`, `packages/scrapers/fixtures/adzuna.json`, `packages/scrapers/test/adapters-adzuna.test.ts`; Modify `packages/scrapers/src/adapters/index.ts`, `supabase/tests/database/010_reference_data.test.sql` (додати `adzuna` у список), `packages/db/src/database.types.ts` (regen — якщо змін немає, ок).

- [ ] **Step 1: Міграція**
```sql
-- Plan 6d: Adzuna (official API, needs ADZUNA_APP_ID + ADZUNA_APP_KEY). Polled rarely: the free key has a small daily quota.
insert into public.sources (id, name, kind, min_interval_minutes) values ('adzuna', 'Adzuna', 'api', 360)
on conflict (id) do nothing;
```
`supabase migration up --local && supabase test db` → PASS.

- [ ] **Step 2: Фікстура** `fixtures/adzuna.json` (форма відповіді Adzuna; ключа немає, тож вручну за документацією):
```json
{
  "count": 3,
  "results": [
    { "id": "4870001001", "title": "Senior <strong>React</strong> Developer (Remote)", "description": "We are looking for a React developer to build our SaaS dashboard. TypeScript, Next.js, Node.js. Fully remote within Europe.", "redirect_url": "https://www.adzuna.pl/land/ad/4870001001?se=x", "created": "2026-10-06T09:12:00Z", "company": { "display_name": "Acme Software" }, "location": { "display_name": "Warszawa, Mazowieckie", "area": ["Polska", "Mazowieckie", "Warszawa"] }, "salary_min": 180000, "salary_max": 240000, "salary_is_predicted": "0", "contract_time": "full_time" },
    { "id": "4870001002", "title": "Full Stack Engineer – Node.js / React", "description": "Remote-first team. Node.js, NestJS, React, PostgreSQL.", "redirect_url": "https://www.adzuna.pl/land/ad/4870001002?se=y", "created": "2026-10-05T15:40:00Z", "company": { "display_name": "Globex" }, "location": { "display_name": "Kraków, Małopolskie", "area": ["Polska", "Małopolskie", "Kraków"] }, "salary_is_predicted": "1", "salary_min": 150000, "salary_max": 150000 },
    { "id": "4870001003", "title": "Frontend Developer", "description": "Vue or React, remote possible.", "redirect_url": "https://www.adzuna.pl/land/ad/4870001003", "created": "2026-10-04T08:00:00Z", "company": {}, "location": { "display_name": "Polska", "area": ["Polska"] } }
  ]
}
```

- [ ] **Step 3: Падаючий тест** `test/adapters-adzuna.test.ts`:
```ts
import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { adzunaAdapter } from '../src/adapters/adzuna';
import { fakeContext } from './fake-context';

const fx = readFileSync(new URL('../fixtures/adzuna.json', import.meta.url), 'utf8');
const env = { ADZUNA_APP_ID: 'id1', ADZUNA_APP_KEY: 'key1' };

describe('adzuna', () => {
  it('is configured only with both keys', () => {
    expect(adzunaAdapter.isConfigured?.({ ADZUNA_APP_ID: 'x' })).toBe(false);
    expect(adzunaAdapter.isConfigured?.(env)).toBe(true);
  });
  it('queries the official API and maps jobs', async () => {
    const { ctx, calls } = fakeContext({ 'api.adzuna.com': fx }, env);
    const jobs = await adzunaAdapter.search({ what: 'react remote', country: 'pl' }, ctx);
    const url = new URL(calls[0]!.url);
    expect(url.origin + url.pathname).toBe('https://api.adzuna.com/v1/api/jobs/pl/search/1');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ app_id: 'id1', app_key: 'key1', what: 'react remote', results_per_page: '50', max_days_old: '7', 'content-type': 'application/json' });
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({ externalId: '4870001001', title: 'Senior React Developer (Remote)', company: 'Acme Software', url: 'https://www.adzuna.pl/land/ad/4870001001?se=x' });
    expect(jobs[0]!.salaryRaw).toBe('180000–240000 PLN / year');
    expect(jobs[1]!.salaryRaw ?? null).toBeNull();
    expect(jobs[2]!.companyIsPlaceholder).toBe(true);
    for (const j of jobs) expect(await normalizeJob(j), j.title).not.toBeNull();
  });
  it('rejects unknown countries and empty queries', async () => {
    const { ctx } = fakeContext({}, env);
    expect(await adzunaAdapter.search({ what: 'react', country: 'xx' }, ctx)).toEqual([]);
    expect(await adzunaAdapter.search({ country: 'pl' }, ctx)).toEqual([]);
  });
});
```
(Поля `RawJob` — `salaryRaw`, `companyIsPlaceholder`, `remoteHint` — звірити з `rawJobSchema` у `packages/core/src/jobs/job.ts` і підлаштувати назви, не змінюючи змісту перевірок.)

- [ ] **Step 4: Адаптер** `adapters/adzuna.ts`:
```ts
import { ADZUNA_COUNTRIES, type RawJob } from '@jp/core';
import type { SourceAdapter } from '../types';

type AdzunaJob = {
  id: string; title: string; description?: string; redirect_url: string; created?: string;
  company?: { display_name?: string }; location?: { display_name?: string };
  salary_min?: number; salary_max?: number; salary_is_predicted?: string;
};
const CURRENCY: Record<(typeof ADZUNA_COUNTRIES)[number], string> = { pl: 'PLN', de: 'EUR', gb: 'GBP', nl: 'EUR' };
const stripTags = (s: string) => s.replace(/<[^>]*>/g, '');

export const adzunaAdapter: SourceAdapter = {
  id: 'adzuna',
  isConfigured: (env) => Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
  async search(params, ctx) {
    const country = ADZUNA_COUNTRIES.find((c) => c === params.country);
    if (!country || !params.what) return [];
    const q = new URLSearchParams({
      app_id: ctx.env.ADZUNA_APP_ID ?? '', app_key: ctx.env.ADZUNA_APP_KEY ?? '', what: params.what,
      results_per_page: '50', max_days_old: '7', sort_by: 'date', 'content-type': 'application/json',
    });
    const data = await ctx.fetchJson<{ results?: AdzunaJob[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${q}`);
    return (data.results ?? []).map((j): RawJob => {
      const real = j.salary_is_predicted !== '1' && j.salary_min != null;
      return {
        externalId: j.id,
        url: j.redirect_url,
        title: stripTags(j.title).trim(),
        company: j.company?.display_name || 'Adzuna',
        companyIsPlaceholder: !j.company?.display_name,
        description: stripTags(j.description ?? ''),
        location: j.location?.display_name ?? null,
        postedAt: j.created ?? null,
        salaryRaw: real ? `${j.salary_min}–${j.salary_max ?? j.salary_min} ${CURRENCY[country]} / year` : null,
        remoteHint: /remote|zdaln|homeoffice|home office/i.test(`${j.title} ${j.description ?? ''}`) ? 'remote' : undefined,
      };
    });
  },
};
```
Зареєструвати в `ADAPTERS`. Ключі в URL — це вимога Adzuna; переконатися, що існуючі логи/помилки HTTP (`packages/scrapers/src/http.ts`) не друкують повний URL з query string; якщо друкують — маскувати `app_key` у повідомленнях помилок (мінімальна зміна + тест).

- [ ] **Step 5:** `pnpm --filter @jp/scrapers test && pnpm typecheck --force` → PASS.
- [ ] **Step 6: Commit** `feat(scrapers): Adzuna adapter (official API, Europe, remote)`

---

### Task 3: jobs — керування витратами Trigger.dev

**Files:** Modify `apps/jobs/src/env.ts`, `apps/jobs/src/pipeline/repository.ts` (`markQueryRun` або місце, де береться `min_interval_minutes`), `apps/jobs/src/trigger/*.ts`, `apps/jobs/.env.example`, тести в `apps/jobs/test/pipeline.int.test.ts` (або новий unit-тест)

**Interfaces:**
- Produces: `scrapeIntervalMultiplier(env?): number`; інтервал наступного запуску = `min_interval_minutes × multiplier`; env `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `SCRAPE_INTERVAL_MULTIPLIER` у `apps/jobs/src/env.ts` (передаються в `ctx.env` адаптерів так само, як `JOOBLE_API_KEY`).

- [ ] **Step 1: Тест** — `scrapeIntervalMultiplier({})` = 1; `'2'` → 2; `'0.5'` → 1 (менше 1 не можна); `'abc'` → 1; `'1.5'` → 1.5. Інтеграційний: після успішного прогону з multiplier 2 `next_run_at` ≈ `now + 2 × min_interval` (подивитися, як `markQueryRun` рахує і як існуючі тести це перевіряють).
- [ ] **Step 2: Реалізація** — функція в `apps/jobs/src/env.ts` (або поруч), застосування в одному місці, де обчислюється наступний запуск.
- [ ] **Step 3: Машини** — у `trigger.config.ts` або в задачах: задачі `scrape-query` для не-браузерних джерел, `enrich-jobs`, `explain-matches`, `schedule-queries`, `expire-jobs`, `sync-profile` — `machine: 'micro'`; браузерні запуски зберігають `small-2x` (див. `schedule-queries.ts:27`). Перевірити підтримувані назви машин і де їх задавати в установленій версії (`apps/jobs/node_modules/@trigger.dev/sdk` типи `MachinePresetName`/`machine`). Якщо `micro` не підтримується — взяти найменшу доступну й зазначити у звіті.
- [ ] **Step 4:** `.env.example`: `ADZUNA_APP_ID=`, `ADZUNA_APP_KEY=`, `SCRAPE_INTERVAL_MULTIPLIER=` з коментарями. `pnpm --filter @jp/jobs typecheck && pnpm --filter @jp/jobs test:integration` → PASS.
- [ ] **Step 5: Commit** `feat(jobs): cheaper machines and an interval multiplier to fit the free Trigger.dev credit; Adzuna keys`

---

### Task 4: Веб — «нові за 24 год» і сортування за свіжістю

**Files:** Modify `apps/web/src/app/[locale]/(app)/today/{feed-filter.ts, feed-filter.test.ts, feed.tsx, feed-types.ts, page.tsx}`, `apps/web/messages/{en,uk,ru}.json`, `apps/web/e2e/today.spec.ts` (або `feed.spec.ts`), `apps/web/e2e/helpers/seed.ts` за потреби

**Interfaces:**
- Produces: `FeedFilters` += `fresh: boolean` (за замовчуванням `false`) і `sort: 'best' | 'newest'` (за замовчуванням `'best'`); `FeedMatch` має `postedAt: string | null` і `firstSeenAt: string` (додати, якщо немає, з `jobs.posted_at`/`jobs.first_seen_at`); `filterMatches(items, f, now = new Date())`; `sortMatches(items, sort)`.

- [ ] **Step 1: Unit-тести** у `feed-filter.test.ts`: `fresh` залишає матчі, у яких `postedAt ?? firstSeenAt` не старші 24 год від `now`; `sortMatches(…, 'newest')` сортує за `postedAt ?? firstSeenAt` спаданням, `'best'` — порядок без змін (сервер уже віддає за скором).
- [ ] **Step 2: Реалізація** — функції, вибірка `posted_at, first_seen_at` у `page.tsx` (у запиті до `jobs` у матчах), перемикачі в панелі фільтрів `feed.tsx` поруч з існуючими (`data-testid="filter-fresh"` — чекбокс, `data-testid="sort-select"` — select), той самий механізм збереження фільтрів, що й у наявних (якщо фільтри зберігаються в URL або localStorage — так само).
- [ ] **Step 3: Тексти** — `today.filterFresh`: en `"New in 24h"`, uk `"Нові за 24 год"`, ru `"Новые за 24 ч"`; `today.sortLabel`: en `"Sort"`, uk `"Сортування"`, ru `"Сортировка"`; `today.sortBest`: en `"Best match"`, uk `"Найкращий збіг"`, ru `"Лучшее совпадение"`; `today.sortNewest`: en `"Newest"`, uk `"Найсвіжіші"`, ru `"Самые свежие"`.
- [ ] **Step 4: E2E** — два матчі: один з `posted_at` 3 дні тому, інший 2 год тому → увімкнення `filter-fresh` лишає лише свіжий; `sort-select = newest` ставить свіжий першим. Desktop і mobile (на mobile — там, де фільтри відкриваються).
- [ ] **Step 5:** `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
- [ ] **Step 6: Commit** `feat(web): fresh-in-24h filter and newest-first sort in the Today feed`

---

### Task 5: Документація і повний прогін

- [ ] **Step 1:** `docs/deploy.md` — у розділі Trigger.dev додати змінні `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` (developer.adzuna.com → Register → App ID і App Key), `SCRAPE_INTERVAL_MULTIPLIER` (1 — як є; 2 — удвічі рідше, удвічі дешевше) і в таблицю змінних; новий підрозділ «Як стежити за витратами Trigger.dev» (Dashboard → Usage; якщо за перший тиждень витрачено > $1.2 — поставити множник 2); у розділі Jooble — де взяти ключ (jooble.org/api/about) і що він іде в Trigger.dev як `JOOBLE_API_KEY`.
- [ ] **Step 2:** Роадмап — рядок `| **6d. Обсяг і швидкість** | Всі ключові слова + варіанти назв посад, Adzuna, дешеві машини й множник частоти, «нові за 24 год» і сортування за свіжістю | 12.1 | ✅ PR #11 |` після рядка Плану 8.
- [ ] **Step 3:** `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
- [ ] **Step 4: Commit** `docs: plan 6d — Adzuna, Jooble keys and Trigger.dev cost control`
