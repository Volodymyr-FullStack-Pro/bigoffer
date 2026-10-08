# План 4 — AI-слой и обогащение вакансий: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить провайдер-агностичный AI-слой (`packages/ai`, Gemini) и с его помощью обогащать вакансии, у которых есть совпадения: роль, навыки, грейд, зарплата, гео-ограничения remote, язык, краткое описание на uk/ru/en, отсев мусора. После обогащения пересчитывать совпадения и раз в день писать «почему подходит» для лучших совпадений. Показать всё это на `/today`.

**Architecture:** `@jp/ai` даёт интерфейс `LlmClient`: JSON по Zod-схеме, картинки, чувствительность `public | private`. Реализация — Gemini через `@google/genai`; ключ выбирается по чувствительности, приватные данные никогда не уходят на бесплатный ключ. Там же лежат доменные функции `enrichJob` и `explainMatches` (промпт, wire-схема, нормализация ответа). `apps/jobs` выбирает вакансии SQL-функцией `jobs_to_enrich`, бережно применяет обогащение (не перетирает хорошие данные), пересчитывает совпадения тем же `scoreJob` и ведёт учёт запросов в `ai_usage` (дневной лимит, темп, остановка на 429). Скоринг в `@jp/core` учитывает AI-навыки, `is_job` и `remote_regions` против страны пользователя (`profiles.country`).

**Tech Stack:** TypeScript 6.0.3, Zod 4.6 (`z.toJSONSchema`), `@google/genai` 2.27, Vitest 5, Supabase (Postgres + pgTAP), Trigger.dev 4.6.4, Next.js 16 + next-intl, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` — разделы 6.3 п.3 (Enrich) и п.5 (Explain), 9 (LLM-ошибки), 10 (тесты `packages/ai`), 12.2 (AI-провайдер, два ключа). Дорожная карта: `docs/superpowers/plans/2026-10-01-roadmap.md`.

## Global Constraints

- Все Global Constraints Планов 1–3 действуют: TS 6.0.3, scope `@jp/`, конвенция БД revoke → grant → RLS, только новые миграции, Zod на границах, типизированные messages en/uk/ru с тестом паритета, коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Два ключа по чувствительности.** `GEMINI_API_KEY_PUBLIC` (бесплатный тариф) — только публичные данные. `GEMINI_API_KEY_PRIVATE` (платный, без обучения на данных) — личные данные. Без приватного ключа `generateJson({ sensitivity: 'private' })` бросает `LlmUnavailableError`; фолбэка на публичный ключ нет никогда.
- В этом плане все вызовы — `sensitivity: 'public'`. Обогащение получает только текст вакансии. «Почему подходит» получает вакансию плюс критерии профиля поиска: ключевые слова, навыки, грейды, формат, мин. зарплата. Имя, контакты, CV, страна и email в промпт **не передаются**.
- Env: `AI_PROVIDER` (по умолчанию `gemini`), `AI_MODEL_PUBLIC` (по умолчанию `gemini-flash-lite-latest`), `AI_MODEL_PRIVATE` (по умолчанию `gemini-flash-latest`), `GEMINI_API_KEY_PUBLIC`, `GEMINI_API_KEY_PRIVATE`, `AI_DAILY_LIMIT` (по умолчанию 900 запросов в сутки UTC на обогащение и пояснения вместе), `AI_BATCH_SIZE` (по умолчанию 30), `AI_MIN_INTERVAL_MS` (по умолчанию 4500, т. е. ≤ 13 запросов в минуту).
- Ключи — только в `apps/jobs/.env` или `.env.local` (gitignored) и в env Trigger.dev. В репозиторий, логи и чат не попадают.
- **Без живых AI-вызовов в тестах и CI.** Везде `FakeLlmClient` из `@jp/ai/testing`. Живая проверка — только ручной скрипт `pnpm --filter @jp/jobs ai:smoke`.
- Обогащаем **только активные вакансии с видимым совпадением** (`job_matches.state in ('new','seen','saved')`), лучшие по score первыми. Каждую вакансию — один раз (`enriched_at`). Не больше 3 неудачных попыток (`enrich_attempts`).
- **Не перетирать хорошие данные.** `title`, `company`, `location`, `description_text` AI не меняет. `seniority` заполняется, только если был `null`. `remote_type` — только если был `'unknown'`. Зарплата — только если обе границы были `null`. `skills`, `role`, `lang`, `summary`, `remote_regions`, `is_job` пишутся из AI.
- **429 / квота** останавливает пачку без штрафа вакансиям. 5xx и сетевые ошибки тоже останавливают пачку без штрафа. Невалидный JSON (после одного повтора внутри клиента) и прочие 4xx дают `enrich_attempts + 1` и `enrich_error`.
- `is_job = false` → `scoreJob` возвращает `null`: такие вакансии не матчатся, их `'new'` совпадения удаляются.
- Remote-вакансия с явными `remote_regions`, в которые не входит `profiles.country` пользователя, получает `location = 0` и скрывается (`state 'hidden'`, `breakdown.excludedBy = 'region'`, `breakdown.blockedRegions = [...]`). При `country = null` или пустых `remote_regions` штрафа нет.
- «Почему подходит» — не больше 20 совпадений на пользователя в сутки (UTC), только `state = 'new'`, `score ≥ 50`, вакансия обогащена и `is_job is not false`. Пишется одним предложением на `profiles.locale` в `job_matches.explanation = { <locale>: text }`; `explained_at` проставляется даже при пустом ответе, чтобы не повторять.

## Структура файлов

```
packages/core/src/jobs/
  detect.ts         FX_TO_USD + PLN, GBP; export MAX_PLAUSIBLE_MONTHLY_USD, MAX_RANGE_RATIO
  salary.ts         SALARY_PERIODS, StructuredSalary, salaryToMonthlyUsd()
  regions.ts        REMOTE_REGIONS, COUNTRY_REGIONS, COUNTRY_CODES, isCountryCode(), normalizeRemoteRegions(), remoteBlockedFor()
  score.ts          ScorableJob.isJob/remoteRegions, MatchBreakdown.blockedRegions, geo-блок
  search.ts         SearchProfile.candidateCountry
packages/core/src/profile/profile-schema.ts   profileUpdateSchema.country
supabase/migrations/20261006000100_ai_enrichment.sql
supabase/tests/database/005_ai_enrichment.test.sql
packages/db/src/database.types.ts             (регенерация)
packages/ai/
  package.json, tsconfig.json
  src/index.ts, src/testing.ts
  src/types.ts      Sensitivity, LlmImage, LlmUsage, GenerateJsonRequest, GenerateJsonResult, LlmClient
  src/errors.ts     LlmError, LlmUnavailableError, LlmRateLimitError, LlmInvalidOutputError
  src/json-schema.ts toResponseJsonSchema()
  src/gemini.ts     createGeminiClient()
  src/env.ts        readAiEnv(), createLlmClient()
  src/tasks/enrich-job.ts      enrichWireSchema, JobEnrichment, normalizeEnrichment(), buildEnrichPrompt(), enrichJob()
  src/tasks/explain-matches.ts explainWireSchema, ExplainJob, ExplainCriteria, explainMatches()
apps/jobs/
  src/env.ts                   AI_DAILY_LIMIT, AI_BATCH_SIZE, AI_MIN_INTERVAL_MS
  src/runtime.ts               aiDeps()
  src/pipeline/repository.ts   candidateCountry, toScorableJob(), getScorableJobs()
  src/pipeline/run-query.ts    матчинг по данным из БД (с AI-полями)
  src/pipeline/ai-repository.ts getJobsToEnrich, enrichmentPatch, saveEnrichment, recordEnrichFailure, getAiRequestsToday, recordAiUsage, getMatchesToExplain, getExplainDetails, saveExplanation
  src/pipeline/rescore.ts      rescoreJobs()
  src/pipeline/enrich.ts       AiDeps, enrichJobs()
  src/pipeline/explain.ts      explainTopMatches()
  src/trigger/queues.ts        AI_PUBLIC_QUEUE
  src/trigger/enrich-jobs.ts   schedules: enrich-jobs (*/15), explain-matches (40 * * * *)
  src/cli/enrich-once.ts, src/cli/ai-smoke.ts
  test/enrich.int.test.ts, test/explain.int.test.ts
apps/web/
  profile: страна проживания; today: summary, «почему подходит», навыки, грейд; messages; E2E
```

---

### Task 1: core — зарплата из структуры, регионы remote, скоринг с AI-полями

**Files:**
- Create: `packages/core/src/jobs/salary.ts`, `packages/core/src/jobs/regions.ts`
- Modify: `packages/core/src/jobs/detect.ts`, `packages/core/src/jobs/score.ts`, `packages/core/src/jobs/search.ts`, `packages/core/src/index.ts`
- Test: `packages/core/src/jobs/salary.test.ts`, `packages/core/src/jobs/regions.test.ts`, `packages/core/src/jobs/score.test.ts` (дополнить)

**Interfaces:**
- Consumes: `FX_TO_USD`, `SearchProfile`, `ScorableJob`, `scoreJob` (существующие).
- Produces:
  - `SALARY_PERIODS = ['hour','month','year'] as const`; `type SalaryPeriod`; `type StructuredSalary = { min: number | null; max: number | null; currency: string | null; period: SalaryPeriod | null }`; `salaryToMonthlyUsd(s: StructuredSalary): { minUsd: number | null; maxUsd: number | null } | null`.
  - `REMOTE_REGIONS` (tuple), `type RemoteRegion`, `COUNTRY_REGIONS: Readonly<Record<string, readonly RemoteRegion[]>>`, `COUNTRY_CODES: readonly string[]`, `isCountryCode(v: unknown): v is string`, `normalizeRemoteRegions(values: readonly string[]): string[]`, `remoteBlockedFor(regions: readonly string[], country: string | null | undefined): boolean`.
  - `ScorableJob` + `isJob?: boolean | null`, `remoteRegions?: string[]`; `MatchBreakdown` + `blockedRegions: string[] | null`; `SearchProfile` + `candidateCountry?: string | null`.
  - `FX_TO_USD` теперь содержит `PLN`, `GBP`; экспортированы `MAX_PLAUSIBLE_MONTHLY_USD`, `MAX_RANGE_RATIO`.

- [ ] **Step 1: Падающие тесты для зарплаты**

`packages/core/src/jobs/salary.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { salaryToMonthlyUsd } from './salary';

describe('salaryToMonthlyUsd', () => {
  it('keeps a monthly USD range', () => {
    expect(salaryToMonthlyUsd({ min: 3000, max: 4000, currency: 'USD', period: 'month' })).toEqual({ minUsd: 3000, maxUsd: 4000 });
  });
  it('converts yearly EUR to monthly USD', () => {
    expect(salaryToMonthlyUsd({ min: 60000, max: null, currency: 'eur', period: 'year' })).toEqual({ minUsd: 5400, maxUsd: null });
  });
  it('converts hourly rates with 168 hours a month', () => {
    expect(salaryToMonthlyUsd({ min: 25, max: 35, currency: 'USD', period: 'hour' })).toEqual({ minUsd: 4200, maxUsd: 5880 });
  });
  it('converts UAH and treats a missing period as monthly', () => {
    expect(salaryToMonthlyUsd({ min: 40000, max: 60000, currency: 'UAH', period: null })).toEqual({ minUsd: 964, maxUsd: 1446 });
  });
  it('converts PLN', () => {
    expect(salaryToMonthlyUsd({ min: 20000, max: 24000, currency: 'PLN', period: 'month' })).toEqual({ minUsd: 5000, maxUsd: 6000 });
  });
  it('rejects unknown or missing currency', () => {
    expect(salaryToMonthlyUsd({ min: 500000, max: null, currency: 'JPY', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 3000, max: null, currency: null, period: 'month' })).toBeNull();
  });
  it('swaps a reversed range and drops an implausibly wide max', () => {
    expect(salaryToMonthlyUsd({ min: 4000, max: 3000, currency: 'USD', period: 'month' })).toEqual({ minUsd: 3000, maxUsd: 4000 });
    expect(salaryToMonthlyUsd({ min: 1000, max: 9000, currency: 'USD', period: 'month' })).toEqual({ minUsd: 1000, maxUsd: null });
  });
  it('rejects empty and implausible values', () => {
    expect(salaryToMonthlyUsd({ min: null, max: null, currency: 'USD', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 0, max: null, currency: 'USD', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 50, max: null, currency: 'USD', period: 'month' })).toBeNull();
    expect(salaryToMonthlyUsd({ min: 200000, max: null, currency: 'USD', period: 'month' })).toBeNull();
  });
});
```

- [ ] **Step 2: Падающие тесты для регионов**

`packages/core/src/jobs/regions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, COUNTRY_REGIONS, isCountryCode, normalizeRemoteRegions, REMOTE_REGIONS, remoteBlockedFor } from './regions';

describe('regions', () => {
  it('maps every country only to known regions', () => {
    for (const regions of Object.values(COUNTRY_REGIONS)) {
      for (const r of regions) expect(REMOTE_REGIONS).toContain(r);
    }
    expect(COUNTRY_CODES).toContain('UA');
    expect(isCountryCode('UA')).toBe(true);
    expect(isCountryCode('ua')).toBe(false);
    expect(isCountryCode('XX')).toBe(false);
  });

  it('normalizes AI region output', () => {
    expect(normalizeRemoteRegions([' Europe ', 'north america', 'US', 'pl', 'UK', 'Mars', 'europe', ''])).toEqual([
      'europe', 'north_america', 'us', 'PL', 'uk',
    ]);
  });

  it('blocks only when the job names regions that exclude the candidate country', () => {
    expect(remoteBlockedFor(['us'], 'UA')).toBe(true);
    expect(remoteBlockedFor(['north_america', 'latam'], 'PL')).toBe(true);
    expect(remoteBlockedFor(['europe'], 'UA')).toBe(false);
    expect(remoteBlockedFor(['eu'], 'UA')).toBe(true);
    expect(remoteBlockedFor(['eu'], 'PL')).toBe(false);
    expect(remoteBlockedFor(['UA', 'us'], 'UA')).toBe(false);
    expect(remoteBlockedFor(['worldwide', 'us'], 'UA')).toBe(false);
    expect(remoteBlockedFor([], 'UA')).toBe(false);
    expect(remoteBlockedFor(['us'], null)).toBe(false);
    expect(remoteBlockedFor(['us'], 'ZZ')).toBe(false);
  });
});
```

- [ ] **Step 3: Падающие тесты для скоринга** — дописать в конец `describe('scoreJob', ...)` в `packages/core/src/jobs/score.test.ts`:
```ts
  it('never matches a posting the AI flagged as not a job', () => {
    expect(scoreJob(profile, { ...job, isJob: false })).toBeNull();
    expect(scoreJob(profile, { ...job, isJob: null })).not.toBeNull();
  });

  it('uses AI skills that the text does not mention', () => {
    const r = scoreJob(profile, { ...job, descriptionText: 'Great team.', skills: ['react', 'go'] })!;
    expect(r.breakdown.matchedSkills).toEqual(['React', 'Go']);
  });

  it('hides a remote job that does not hire from the candidate country', () => {
    const r = scoreJob({ ...profile, candidateCountry: 'UA' }, { ...job, remoteRegions: ['us', 'canada'] })!;
    expect(r.hidden).toBe(true);
    expect(r.breakdown.location).toBe(0);
    expect(r.breakdown.excludedBy).toBe('region');
    expect(r.breakdown.blockedRegions).toEqual(['us', 'canada']);
  });

  it('keeps a remote job open to the candidate region', () => {
    const r = scoreJob({ ...profile, candidateCountry: 'UA' }, { ...job, remoteRegions: ['europe'] })!;
    expect(r.hidden).toBe(false);
    expect(r.breakdown.location).toBe(15);
    expect(r.breakdown.blockedRegions).toBeNull();
  });

  it('prefers a keyword exclusion over a region block', () => {
    const r = scoreJob(
      { ...profile, candidateCountry: 'UA' },
      { ...job, descriptionText: `${job.descriptionText} gambling`, remoteRegions: ['us'] },
    )!;
    expect(r.breakdown.excludedBy).toBe('gambling');
  });
```

- [ ] **Step 4: Запустить и убедиться, что падают**

Run: `pnpm --filter @jp/core test`
Expected: FAIL — `Cannot find module './salary'` / `'./regions'`, а в score-тестах `blockedRegions` undefined и `isJob: false` даёт совпадение.

- [ ] **Step 5: Экспорт констант и валют в `detect.ts`**

В `packages/core/src/jobs/detect.ts`:
```ts
/** Approximate conversion rates to USD; refresh occasionally. */
export const FX_TO_USD = { USD: 1, EUR: 1.08, UAH: 1 / 41.5, PLN: 0.25, GBP: 1.27 } as const;
```
и внизу файла:
```ts
const MIN_PLAUSIBLE_MONTHLY_USD = 500;
export const MAX_PLAUSIBLE_MONTHLY_USD = 100_000;
export const MAX_RANGE_RATIO = 4;
```
`detectCurrency` и `UNSUPPORTED_CURRENCY` не трогать: текстовый парсер по-прежнему отклоняет `pln`/`gbp`, курсы нужны только структурированной зарплате от AI.

- [ ] **Step 6: `salary.ts`**

`packages/core/src/jobs/salary.ts`:
```ts
import { FX_TO_USD, MAX_PLAUSIBLE_MONTHLY_USD, MAX_RANGE_RATIO } from './detect';

export const SALARY_PERIODS = ['hour', 'month', 'year'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

/** A salary already split into numbers by someone else (e.g. the AI enrichment), in the posting's currency. */
export type StructuredSalary = {
  min: number | null;
  max: number | null;
  currency: string | null;
  period: SalaryPeriod | null;
};

const HOURS_PER_MONTH = 168;
/** Below this a "monthly" figure is a misread (hourly, thousands, typo); low-wage boards still clear it. */
const MIN_MONTHLY_USD = 100;

export function salaryToMonthlyUsd(s: StructuredSalary): { minUsd: number | null; maxUsd: number | null } | null {
  const code = s.currency?.trim().toUpperCase();
  const rate = code && Object.hasOwn(FX_TO_USD, code) ? FX_TO_USD[code as keyof typeof FX_TO_USD] : undefined;
  if (rate === undefined) return null;
  const factor = s.period === 'hour' ? HOURS_PER_MONTH : s.period === 'year' ? 1 / 12 : 1;
  const convert = (v: number | null) => (v != null && Number.isFinite(v) && v > 0 ? Math.round(v * rate * factor) : null);

  let minUsd = convert(s.min);
  let maxUsd = convert(s.max);
  if (minUsd == null && maxUsd == null) return null;
  if (minUsd != null && maxUsd != null && minUsd > maxUsd) [minUsd, maxUsd] = [maxUsd, minUsd];
  if (minUsd != null && maxUsd != null && maxUsd / minUsd > MAX_RANGE_RATIO) maxUsd = null;
  const values = [minUsd, maxUsd].filter((v): v is number => v != null);
  if (values.some((v) => v < MIN_MONTHLY_USD || v > MAX_PLAUSIBLE_MONTHLY_USD)) return null;
  return { minUsd, maxUsd };
}
```

- [ ] **Step 7: `regions.ts`**

`packages/core/src/jobs/regions.ts`:
```ts
/** Where a remote employer hires. AI enrichment returns these codes or ISO 3166-1 alpha-2 country codes. */
export const REMOTE_REGIONS = [
  'worldwide', 'europe', 'eu', 'cee', 'uk', 'north_america', 'us', 'canada', 'latam', 'apac', 'mena', 'africa',
] as const;
export type RemoteRegion = (typeof REMOTE_REGIONS)[number];

const EU = ['eu', 'europe'] as const satisfies readonly RemoteRegion[];
const EU_CEE = ['eu', 'europe', 'cee'] as const satisfies readonly RemoteRegion[];

/** Countries a user can pick as their residence, with the hiring regions each belongs to. */
export const COUNTRY_REGIONS: Readonly<Record<string, readonly RemoteRegion[]>> = {
  UA: ['europe', 'cee'],
  MD: ['europe', 'cee'],
  PL: EU_CEE, CZ: EU_CEE, SK: EU_CEE, HU: EU_CEE, RO: EU_CEE, BG: EU_CEE,
  LT: EU_CEE, LV: EU_CEE, EE: EU_CEE, HR: EU_CEE, SI: EU_CEE,
  DE: EU, AT: EU, NL: EU, BE: EU, LU: EU, FR: EU, ES: EU, PT: EU, IT: EU,
  IE: EU, DK: EU, SE: EU, FI: EU, GR: EU, CY: EU, MT: EU,
  GB: ['uk', 'europe'],
  CH: ['europe'],
  NO: ['europe'],
  US: ['us', 'north_america'],
  CA: ['canada', 'north_america'],
  MX: ['latam', 'north_america'],
  BR: ['latam'], AR: ['latam'], CO: ['latam'],
  IN: ['apac'], AU: ['apac'], SG: ['apac'],
  AE: ['mena'], IL: ['mena'], TR: ['europe', 'mena'],
  ZA: ['africa'], EG: ['africa', 'mena'],
};

export const COUNTRY_CODES: readonly string[] = Object.keys(COUNTRY_REGIONS).sort();

export function isCountryCode(v: unknown): v is string {
  return typeof v === 'string' && Object.hasOwn(COUNTRY_REGIONS, v);
}

/** Region codes lowercased (`"North America"` → `north_america`), anything two-letter as an upper-case country. */
export function normalizeRemoteRegions(values: readonly string[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
    if ((REMOTE_REGIONS as readonly string[]).includes(key)) out.add(key);
    else if (/^[a-z]{2}$/.test(key)) out.add(key.toUpperCase());
  }
  return [...out];
}

/** True when a remote job names the regions it hires from and none of them covers `country`. */
export function remoteBlockedFor(regions: readonly string[], country: string | null | undefined): boolean {
  if (!country || regions.length === 0 || regions.includes('worldwide')) return false;
  const mine: readonly string[] | undefined = COUNTRY_REGIONS[country];
  if (!mine) return false;
  return !regions.some((r) => r === country || mine.includes(r));
}
```

- [ ] **Step 8: Скоринг**

В `packages/core/src/jobs/search.ts` расширить тип:
```ts
export type SearchProfile = Omit<SearchProfileInput, 'id' | 'name' | 'isActive' | 'sources'> & {
  id: string;
  userId: string;
  sources: SourceId[] | null;
  /** Owner's country of residence (profiles.country, ISO alpha-2): remote jobs restricted elsewhere are hidden. */
  candidateCountry?: string | null;
};
```

В `packages/core/src/jobs/score.ts`:
```ts
import { remoteBlockedFor } from './regions';
```
```ts
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
  /** AI verdict; false means the posting is not a real vacancy (course, ad, spam). */
  isJob?: boolean | null;
  /** AI: where a remote hire may live (region codes or ISO countries); empty when not stated. */
  remoteRegions?: string[];
};

export type MatchBreakdown = {
  skills: number;
  role: number;
  seniority: number;
  location: number;
  salary: number;
  matchedSkills: string[];
  excludedBy: string | null;
  /** The job's remote regions when they exclude the candidate's country. */
  blockedRegions: string[] | null;
};
```
В `scoreJob` первой строкой:
```ts
  if (job.isJob === false) return null;
```
а сборку `breakdown` заменить на:
```ts
  const regions = job.remoteRegions ?? [];
  const blockedRegions =
    job.remoteType === 'remote' && remoteBlockedFor(regions, profile.candidateCountry) ? regions : null;
  const keywordExclusion = profile.excludeKeywords.find((e) => containsTerm(text, e))?.toLowerCase() ?? null;
  const breakdown: MatchBreakdown = {
    skills,
    role,
    seniority: seniorityPoints(profile.seniority, job.seniority),
    location: blockedRegions ? 0 : locationPoints(profile, job),
    salary: salaryPoints(profile.salaryMinUsd, job),
    matchedSkills,
    // 'region' hides the row like an exclude keyword, so upsert_job_matches keeps rescoring it.
    excludedBy: keywordExclusion ?? (blockedRegions ? 'region' : null),
    blockedRegions,
  };
```
В `packages/core/src/index.ts` добавить:
```ts
export * from './jobs/salary';
export * from './jobs/regions';
```

- [ ] **Step 9: Прогнать тесты и typecheck**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS. Прежние тесты `score.test.ts` не меняются: `blockedRegions` отсутствует в их точных ожиданиях.

Run: `pnpm typecheck`
Expected: PASS. Если `apps/jobs` или `apps/web` где-то собирают `MatchBreakdown` литералом, добавить `blockedRegions: null`.

- [ ] **Step 10: Commit**

```bash
git add packages/core
git commit -m "feat(core): structured salary conversion, remote regions and AI-aware scoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: БД — поля обогащения, страна пользователя, учёт AI, выборки

**Files:**
- Create: `supabase/migrations/20261006000100_ai_enrichment.sql`, `supabase/tests/database/005_ai_enrichment.test.sql`
- Modify: `packages/db/src/database.types.ts` (регенерация)

**Interfaces:**
- Produces (SQL):
  - `jobs.role text`, `jobs.remote_regions text[] not null default '{}'`, `jobs.is_job boolean`, `jobs.enrich_attempts smallint not null default 0`.
  - `job_matches.explained_at timestamptz`.
  - `profiles.country text` (ISO alpha-2, `^[A-Z]{2}$`), колонка доступна пользователю на update.
  - `ai_usage(day date, sensitivity text, model text, requests int, input_tokens bigint, output_tokens bigint, PK(day, sensitivity, model))`, только service_role.
  - `record_ai_usage(p_day date, p_sensitivity text, p_model text, p_requests int, p_input bigint, p_output bigint) returns void`.
  - `jobs_to_enrich(p_limit int, p_job_ids uuid[] default null) returns setof uuid`.
  - `matches_to_explain(p_day_start timestamptz, p_per_user int, p_min_score int, p_user_ids uuid[] default null) returns table(match_id uuid, user_id uuid, locale text)`.
  - Все три функции: execute только у `service_role`.

- [ ] **Step 1: Падающий pgTAP-тест**

`supabase/tests/database/005_ai_enrichment.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_column('public', 'jobs', 'remote_regions', 'jobs.remote_regions exists');
select has_column('public', 'jobs', 'is_job', 'jobs.is_job exists');
select has_column('public', 'job_matches', 'explained_at', 'job_matches.explained_at exists');

insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'ai-a@test.dev');
insert into public.companies (id, name, normalized_name)
  values ('a4000000-0000-0000-0000-000000000001', 'AI Co', 'ai co plan4 test');
insert into public.jobs (id, fingerprint, title, company_id, enriched_at, enrich_attempts, is_job) values
  ('b4000000-0000-0000-0000-000000000001', 'p4-1', 'Fresh', 'a4000000-0000-0000-0000-000000000001', null, 0, null),
  ('b4000000-0000-0000-0000-000000000002', 'p4-2', 'Hidden only', 'a4000000-0000-0000-0000-000000000001', null, 0, null),
  ('b4000000-0000-0000-0000-000000000003', 'p4-3', 'Enriched top', 'a4000000-0000-0000-0000-000000000001', now(), 0, true),
  ('b4000000-0000-0000-0000-000000000004', 'p4-4', 'Gave up', 'a4000000-0000-0000-0000-000000000001', null, 3, null),
  ('b4000000-0000-0000-0000-000000000005', 'p4-5', 'Not a job', 'a4000000-0000-0000-0000-000000000001', now(), 0, false),
  ('b4000000-0000-0000-0000-000000000006', 'p4-6', 'Enriched second', 'a4000000-0000-0000-0000-000000000001', now(), 0, true),
  ('b4000000-0000-0000-0000-000000000007', 'p4-7', 'Explained today', 'a4000000-0000-0000-0000-000000000001', now(), 0, true);
insert into public.job_matches (user_id, job_id, score, state, explained_at) values
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000001', 90, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000002', 95, 'hidden', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000003', 80, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000004', 70, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000005', 99, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000006', 75, 'new', null),
  ('66666666-6666-6666-6666-666666666666', 'b4000000-0000-0000-0000-000000000007', 60, 'new', now());

select is(
  (select array_agg(id) from public.jobs_to_enrich(10, array[
     'b4000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000002',
     'b4000000-0000-0000-0000-000000000003', 'b4000000-0000-0000-0000-000000000004']::uuid[]) as id),
  array['b4000000-0000-0000-0000-000000000001']::uuid[],
  'only active, unenriched jobs with a visible match and attempts left');

select public.record_ai_usage('2026-10-06', 'public', 'pgtap-model', 1, 100, 20);
select public.record_ai_usage('2026-10-06', 'public', 'pgtap-model', 2, 50, 5);
select results_eq(
  $$ select requests, input_tokens::int, output_tokens::int from public.ai_usage where model = 'pgtap-model' $$,
  $$ values (3, 150, 25) $$,
  'usage accumulates per day, sensitivity and model');

select results_eq(
  $$ select j.title from public.matches_to_explain(date_trunc('day', now()), 2, 50,
       array['66666666-6666-6666-6666-666666666666']::uuid[]) e
     join public.job_matches m on m.id = e.match_id
     join public.jobs j on j.id = m.job_id $$,
  $$ values ('Enriched top'::text) $$,
  'best unexplained enriched real job, within what is left of the daily per-user budget');

set local role authenticated;
set local request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select lives_ok($$ update public.profiles set country = 'UA' where id = '66666666-6666-6666-6666-666666666666' $$,
  'a user sets their own country');
select throws_ok($$ update public.profiles set country = 'ukraine' where id = '66666666-6666-6666-6666-666666666666' $$,
  '23514', null, 'country must be an ISO alpha-2 code');
select throws_ok($$ select * from public.ai_usage $$, '42501', null, 'ai_usage is service-only');
select throws_ok($$ select public.record_ai_usage(current_date, 'public', 'x', 1, 0, 0) $$,
  '42501', null, 'record_ai_usage is service-only');
select throws_ok($$ select * from public.jobs_to_enrich(1) $$, '42501', null, 'jobs_to_enrich is service-only');

reset role;
select is((select country from public.profiles where id = '66666666-6666-6666-6666-666666666666'), 'UA',
  'country is stored');

select * from finish();
rollback;
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `supabase test db`
Expected: FAIL в `005_ai_enrichment.test.sql` — колонки `remote_regions` нет.

- [ ] **Step 3: Миграция**

`supabase/migrations/20261006000100_ai_enrichment.sql`:
```sql
-- Plan 4: AI enrichment of jobs, "why it fits" explanations, the user's country, AI usage accounting.

alter table public.jobs
  add column role text,
  add column remote_regions text[] not null default '{}',
  add column is_job boolean,
  add column enrich_attempts smallint not null default 0;

alter table public.job_matches add column explained_at timestamptz;

alter table public.profiles add column country text
  constraint profiles_country_iso check (country is null or country ~ '^[A-Z]{2}$');
grant update (country) on public.profiles to authenticated;

-- Daily AI request/token counters (UTC day). Service-only: no grants, RLS on without policies.
create table public.ai_usage (
  day date not null,
  sensitivity text not null check (sensitivity in ('public', 'private')),
  model text not null,
  requests int not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, sensitivity, model)
);
revoke all on public.ai_usage from anon, authenticated;
alter table public.ai_usage enable row level security;

create or replace function public.record_ai_usage(
  p_day date, p_sensitivity text, p_model text, p_requests int, p_input bigint, p_output bigint
) returns void language sql security invoker set search_path = '' as $$
  insert into public.ai_usage as u (day, sensitivity, model, requests, input_tokens, output_tokens)
  values (p_day, p_sensitivity, p_model, p_requests, p_input, p_output)
  on conflict (day, sensitivity, model) do update
    set requests = u.requests + excluded.requests,
        input_tokens = u.input_tokens + excluded.input_tokens,
        output_tokens = u.output_tokens + excluded.output_tokens
$$;
revoke execute on function public.record_ai_usage(date, text, text, int, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_ai_usage(date, text, text, int, bigint, bigint) to service_role;

-- Jobs worth an AI call: active, never enriched, under 3 failed attempts, and someone still sees a match.
-- Best match first so a limited daily budget goes to what users look at. p_job_ids scopes tests.
create or replace function public.jobs_to_enrich(p_limit int, p_job_ids uuid[] default null)
returns setof uuid language sql stable security invoker set search_path = '' as $$
  select j.id
  from public.jobs j
  join public.job_matches m on m.job_id = j.id and m.state in ('new', 'seen', 'saved')
  where j.status = 'active'
    and j.enriched_at is null
    and j.enrich_attempts < 3
    and (p_job_ids is null or j.id = any (p_job_ids))
  group by j.id
  order by max(m.score) desc, j.first_seen_at desc
  limit p_limit
$$;
revoke execute on function public.jobs_to_enrich(int, uuid[]) from public, anon, authenticated;
grant execute on function public.jobs_to_enrich(int, uuid[]) to service_role;

-- Per user: the best fresh 'new' matches on enriched real jobs that still lack an explanation, limited to what
-- is left of p_per_user after the matches already explained since p_day_start. p_user_ids scopes tests.
create or replace function public.matches_to_explain(
  p_day_start timestamptz, p_per_user int, p_min_score int, p_user_ids uuid[] default null
) returns table (match_id uuid, user_id uuid, locale text)
language sql stable security invoker set search_path = '' as $$
  with done as (
    select m.user_id, count(*)::int as n
    from public.job_matches m
    where m.explained_at >= p_day_start
      and (p_user_ids is null or m.user_id = any (p_user_ids))
    group by m.user_id
  ), ranked as (
    select m.id, m.user_id, p.locale,
           row_number() over (partition by m.user_id order by m.score desc, m.created_at desc) as rn
    from public.job_matches m
    join public.jobs j on j.id = m.job_id
    join public.profiles p on p.id = m.user_id
    where m.state = 'new'
      and m.explained_at is null
      and m.score >= p_min_score
      and m.created_at > now() - interval '3 days'
      and j.status = 'active'
      and j.enriched_at is not null
      and j.is_job is not false
      and (p_user_ids is null or m.user_id = any (p_user_ids))
  )
  select r.id, r.user_id, r.locale
  from ranked r
  left join done d on d.user_id = r.user_id
  where r.rn <= p_per_user - coalesce(d.n, 0)
  order by r.user_id, r.rn
$$;
revoke execute on function public.matches_to_explain(timestamptz, int, int, uuid[]) from public, anon, authenticated;
grant execute on function public.matches_to_explain(timestamptz, int, int, uuid[]) to service_role;
```

- [ ] **Step 4: Применить, прогнать pgTAP, регенерировать типы**

Run: `pnpm db:reset && supabase test db`
Expected: PASS, все файлы включая `005_ai_enrichment.test.sql` (12 тестов).

Run: `pnpm db:types && pnpm typecheck`
Expected: в `packages/db/src/database.types.ts` есть `ai_usage`, `jobs.remote_regions`, `profiles.country`, `Functions.jobs_to_enrich`, `matches_to_explain`, `record_ai_usage`; typecheck PASS. После `db:reset` выполнить `pnpm db:env`: ключи локального стека не меняются, но шаг безопасен.

- [ ] **Step 5: Commit**

```bash
git add supabase packages/db
git commit -m "feat(db): AI enrichment columns, user country, AI usage accounting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `packages/ai` — LlmClient, Gemini, ключи по чувствительности, фейк для тестов

**Files:**
- Create: `packages/ai/package.json`, `packages/ai/tsconfig.json`, `packages/ai/src/index.ts`, `packages/ai/src/testing.ts`, `packages/ai/src/types.ts`, `packages/ai/src/errors.ts`, `packages/ai/src/json-schema.ts`, `packages/ai/src/gemini.ts`, `packages/ai/src/env.ts`
- Test: `packages/ai/src/json-schema.test.ts`, `packages/ai/src/gemini.test.ts`, `packages/ai/src/env.test.ts`

**Interfaces:**
- Produces (`@jp/ai`):
  - `SENSITIVITIES = ['public','private'] as const`, `type Sensitivity`.
  - `type LlmImage = { mimeType: string; dataBase64: string }`.
  - `type LlmUsage = { requests: number; inputTokens: number; outputTokens: number }`.
  - `type GenerateJsonRequest<S extends z.ZodType> = { sensitivity: Sensitivity; schema: S; system: string; prompt: string; images?: LlmImage[]; maxOutputTokens?: number }`.
  - `type GenerateJsonResult<T> = { data: T; usage: LlmUsage; model: string }`.
  - `interface LlmClient { isAvailable(s: Sensitivity): boolean; model(s: Sensitivity): string; generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>> }`.
  - Ошибки: `LlmError` (`status: number | null`), `LlmUnavailableError`, `LlmRateLimitError` (`retryAfterMs: number | null`), `LlmInvalidOutputError` (`raw: string`, `usage: LlmUsage`).
  - `toResponseJsonSchema(schema: z.ZodType): Record<string, unknown>`.
  - `createGeminiClient(opts: GeminiOptions): LlmClient`.
  - `readAiEnv(env?: Record<string, string | undefined>): AiEnv`, `createLlmClient(env: AiEnv): LlmClient`.
  - `@jp/ai/testing`: `class FakeLlmClient implements LlmClient` с полем `calls`.

- [ ] **Step 1: Пакет и зависимости**

`packages/ai/package.json`:
```json
{
  "name": "@jp/ai",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./testing": "./src/testing.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@google/genai": "^2.27.0",
    "@jp/core": "workspace:*",
    "zod": "^4.6.5"
  },
  "devDependencies": {
    "@types/node": "^20",
    "typescript": "6.0.3",
    "vitest": "^5.0.3"
  }
}
```
`packages/ai/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM"], "types": ["node"] },
  "include": ["src"]
}
```
Run: `pnpm install`
Expected: `@google/genai` 2.27.x установлен, lockfile обновлён.

- [ ] **Step 2: Падающие тесты**

`packages/ai/src/json-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toResponseJsonSchema } from './json-schema';

describe('toResponseJsonSchema', () => {
  it('produces a plain JSON schema Gemini accepts', () => {
    const schema = z.object({
      level: z.enum(['a', 'b']).nullable(),
      tags: z.array(z.string().max(40)).max(3),
      n: z.number().int(),
    });
    const out = toResponseJsonSchema(schema);
    expect(out).not.toHaveProperty('$schema');
    expect(out).toMatchObject({
      type: 'object',
      required: ['level', 'tags', 'n'],
      properties: {
        level: { anyOf: [{ type: 'string', enum: ['a', 'b'] }, { type: 'null' }] },
        tags: { type: 'array', maxItems: 3, items: { type: 'string' } },
        n: { type: 'integer' },
      },
    });
    expect(JSON.stringify(out)).not.toMatch(/maxLength|9007199254740991/);
  });

  it('keeps descriptions for the model', () => {
    const out = toResponseJsonSchema(z.object({ role: z.string().describe('Role in English') }));
    expect(out).toMatchObject({ properties: { role: { description: 'Role in English' } } });
  });
});
```

`packages/ai/src/gemini.test.ts`:
```ts
import { ApiError } from '@google/genai';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LlmError, LlmInvalidOutputError, LlmRateLimitError, LlmUnavailableError } from './errors';
import { createGeminiClient, type GeminiResponse } from './gemini';

const schema = z.object({ answer: z.string() });
const ok = (text: string, prompt = 10, out = 3): GeminiResponse => ({
  text,
  usageMetadata: { promptTokenCount: prompt, candidatesTokenCount: out },
});

function setup(responses: (GeminiResponse | Error)[], keys: { publicKey?: string; privateKey?: string } = { publicKey: 'pub-key' }) {
  const calls: { apiKey: string; params: Record<string, unknown> }[] = [];
  const client = createGeminiClient({
    ...keys,
    publicModel: 'model-public',
    privateModel: 'model-private',
    connect: (apiKey) => async (params) => {
      calls.push({ apiKey, params: params as unknown as Record<string, unknown> });
      const next = responses.shift();
      if (!next) throw new Error('no more fake responses');
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { client, calls };
}

describe('createGeminiClient', () => {
  it('asks for JSON by schema and returns parsed data with usage', async () => {
    const { client, calls } = setup([ok('{"answer":"42"}')]);
    const res = await client.generateJson({ sensitivity: 'public', schema, system: 'Be terse.', prompt: 'Q?' });
    expect(res).toEqual({ data: { answer: '42' }, usage: { requests: 1, inputTokens: 10, outputTokens: 3 }, model: 'model-public' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.apiKey).toBe('pub-key');
    expect(calls[0]!.params).toMatchObject({
      model: 'model-public',
      contents: [{ role: 'user', parts: [{ text: 'Q?' }] }],
      config: { systemInstruction: 'Be terse.', responseMimeType: 'application/json', responseJsonSchema: { type: 'object' } },
    });
  });

  it('puts images before the text part', async () => {
    const { client, calls } = setup([ok('{"answer":"cat"}')]);
    await client.generateJson({
      sensitivity: 'public',
      schema,
      system: 's',
      prompt: 'What is it?',
      images: [{ mimeType: 'image/png', dataBase64: 'AAAA' }],
    });
    expect(calls[0]!.params).toMatchObject({
      contents: [{ parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }, { text: 'What is it?' }] }],
    });
  });

  it('never sends private data with the public key', async () => {
    const { client, calls } = setup([]);
    expect(client.isAvailable('public')).toBe(true);
    expect(client.isAvailable('private')).toBe(false);
    await expect(client.generateJson({ sensitivity: 'private', schema, system: 's', prompt: 'cv' })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    );
    expect(calls).toHaveLength(0);
  });

  it('uses the private key and model for private requests', async () => {
    const { client, calls } = setup([ok('{"answer":"x"}')], { publicKey: 'pub-key', privateKey: 'priv-key' });
    const res = await client.generateJson({ sensitivity: 'private', schema, system: 's', prompt: 'cv' });
    expect(calls[0]!.apiKey).toBe('priv-key');
    expect(res.model).toBe('model-private');
  });

  it('retries once on invalid output and sums usage', async () => {
    const { client, calls } = setup([ok('not json', 10, 2), ok('{"answer":"ok"}', 10, 3)]);
    const res = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' });
    expect(res.data).toEqual({ answer: 'ok' });
    expect(res.usage).toEqual({ requests: 2, inputTokens: 20, outputTokens: 5 });
    expect(calls).toHaveLength(2);
  });

  it('gives up after two invalid outputs and reports the usage spent', async () => {
    const { client } = setup([ok('{"answer":1}'), ok('')]);
    const err = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmInvalidOutputError);
    expect((err as LlmInvalidOutputError).usage.requests).toBe(2);
  });

  it('maps 429 to LlmRateLimitError with the server retry delay', async () => {
    const body = JSON.stringify({ error: { code: 429, details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '37s' }] } });
    const { client } = setup([new ApiError({ message: body, status: 429 })]);
    const err = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRateLimitError);
    expect((err as LlmRateLimitError).retryAfterMs).toBe(37_000);
  });

  it('maps other API and network errors to LlmError with status', async () => {
    const { client } = setup([new ApiError({ message: 'overloaded', status: 503 }), new TypeError('fetch failed')]);
    const first = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(LlmError);
    expect((first as LlmError).status).toBe(503);
    const second = await client.generateJson({ sensitivity: 'public', schema, system: 's', prompt: 'p' }).catch((e: unknown) => e);
    expect(second).toBeInstanceOf(LlmError);
    expect((second as LlmError).status).toBeNull();
  });
});
```

`packages/ai/src/env.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createLlmClient, readAiEnv } from './env';

describe('readAiEnv', () => {
  it('defaults to Gemini models and treats empty keys as missing', () => {
    const env = readAiEnv({ GEMINI_API_KEY_PUBLIC: 'k', GEMINI_API_KEY_PRIVATE: '' });
    expect(env).toEqual({
      AI_PROVIDER: 'gemini',
      AI_MODEL_PUBLIC: 'gemini-flash-lite-latest',
      AI_MODEL_PRIVATE: 'gemini-flash-latest',
      GEMINI_API_KEY_PUBLIC: 'k',
      GEMINI_API_KEY_PRIVATE: undefined,
    });
    const client = createLlmClient(env);
    expect(client.isAvailable('public')).toBe(true);
    expect(client.isAvailable('private')).toBe(false);
    expect(client.model('public')).toBe('gemini-flash-lite-latest');
  });

  it('rejects an unknown provider', () => {
    expect(() => readAiEnv({ AI_PROVIDER: 'openai' })).toThrow();
  });
});
```

- [ ] **Step 3: Убедиться, что тесты падают**

Run: `pnpm --filter @jp/ai test`
Expected: FAIL — модулей `./json-schema`, `./gemini`, `./env`, `./errors` нет.

- [ ] **Step 4: Типы и ошибки**

`packages/ai/src/types.ts`:
```ts
import type { z } from 'zod';

/** public: data anyone can see (job postings) — free tier allowed. private: personal data — paid, no-training key only. */
export const SENSITIVITIES = ['public', 'private'] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export type LlmImage = { mimeType: string; dataBase64: string };

export type LlmUsage = { requests: number; inputTokens: number; outputTokens: number };

export type GenerateJsonRequest<S extends z.ZodType> = {
  sensitivity: Sensitivity;
  /** Plain object schema without transforms: it is sent to the model as JSON Schema. */
  schema: S;
  system: string;
  prompt: string;
  images?: LlmImage[];
  maxOutputTokens?: number;
};

export type GenerateJsonResult<T> = { data: T; usage: LlmUsage; model: string };

export interface LlmClient {
  /** True when a key for this sensitivity is configured. Private requests never fall back to the public key. */
  isAvailable(sensitivity: Sensitivity): boolean;
  /** Model used for this sensitivity (usage accounting, logs). */
  model(sensitivity: Sensitivity): string;
  generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>>;
}
```

`packages/ai/src/errors.ts`:
```ts
import type { LlmUsage, Sensitivity } from './types';

export class LlmError extends Error {
  /** HTTP status from the provider; null for network errors and timeouts. */
  readonly status: number | null;
  constructor(message: string, status: number | null = null, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LlmError';
    this.status = status;
  }
}

export class LlmUnavailableError extends LlmError {
  constructor(sensitivity: Sensitivity) {
    super(`No AI key configured for ${sensitivity} data`);
    this.name = 'LlmUnavailableError';
  }
}

export class LlmRateLimitError extends LlmError {
  readonly retryAfterMs: number | null;
  constructor(message: string, retryAfterMs: number | null, options?: ErrorOptions) {
    super(message, 429, options);
    this.name = 'LlmRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class LlmInvalidOutputError extends LlmError {
  readonly raw: string;
  readonly usage: LlmUsage;
  constructor(message: string, raw: string, usage: LlmUsage) {
    super(message);
    this.name = 'LlmInvalidOutputError';
    this.raw = raw;
    this.usage = usage;
  }
}
```

- [ ] **Step 5: JSON Schema для ответа**

`packages/ai/src/json-schema.ts`:
```ts
import { z } from 'zod';

// Gemini's responseJsonSchema supports a subset of JSON Schema; these keys either fail or add nothing.
const DROP_KEYS = new Set(['$schema', 'maxLength', 'minLength', 'pattern', 'format']);
const SAFE_INT_BOUNDS = new Set([Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]);

function strip(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROP_KEYS.has(key)) continue;
    if ((key === 'minimum' || key === 'maximum') && SAFE_INT_BOUNDS.has(value as number)) continue;
    out[key] = strip(value);
  }
  return out;
}

/** JSON Schema for `config.responseJsonSchema`. The schema must not use transforms (they have no JSON form). */
export function toResponseJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return strip(z.toJSONSchema(schema, { target: 'draft-2020-12' })) as Record<string, unknown>;
}
```

- [ ] **Step 6: Gemini-клиент**

`packages/ai/src/gemini.ts`:
```ts
import { ApiError, GoogleGenAI, type GenerateContentParameters, type Part } from '@google/genai';
import type { z } from 'zod';
import { LlmError, LlmInvalidOutputError, LlmRateLimitError, LlmUnavailableError } from './errors';
import { toResponseJsonSchema } from './json-schema';
import type { GenerateJsonRequest, GenerateJsonResult, LlmClient, LlmUsage, Sensitivity } from './types';

export type GeminiResponse = {
  text?: string;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};
type GenerateContent = (params: GenerateContentParameters) => Promise<GeminiResponse>;

export type GeminiOptions = {
  publicKey?: string;
  privateKey?: string;
  publicModel: string;
  privateModel: string;
  /** Test seam: builds the generateContent call for one API key. */
  connect?: (apiKey: string) => GenerateContent;
};

const ATTEMPTS = 2;

function defaultConnect(apiKey: string): GenerateContent {
  // Retries are ours: a blind SDK retry on 429 would burn the free daily quota.
  const ai = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60_000, retryOptions: { attempts: 1 } } });
  return (params) => ai.models.generateContent(params);
}

function retryDelayMs(message: string): number | null {
  const m = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Math.round(Number(m[1]) * 1000) : null;
}

function toLlmError(err: unknown): LlmError {
  if (err instanceof ApiError) {
    return err.status === 429
      ? new LlmRateLimitError(err.message, retryDelayMs(err.message), { cause: err })
      : new LlmError(err.message, err.status, { cause: err });
  }
  return new LlmError(err instanceof Error ? err.message : String(err), null, { cause: err });
}

function parse<S extends z.ZodType>(schema: S, text: string | undefined): { ok: true; data: z.output<S> } | { ok: false; message: string } {
  if (!text) return { ok: false, message: 'empty response' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: 'response is not JSON' };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
  return { ok: false, message: `response does not match the schema: ${issues.join('; ')}` };
}

export function createGeminiClient(opts: GeminiOptions): LlmClient {
  const connect = opts.connect ?? defaultConnect;
  const connections = new Map<Sensitivity, GenerateContent>();
  const keyFor = (s: Sensitivity) => (s === 'public' ? opts.publicKey : opts.privateKey) || undefined;
  const modelFor = (s: Sensitivity) => (s === 'public' ? opts.publicModel : opts.privateModel);

  return {
    isAvailable: (s) => keyFor(s) !== undefined,
    model: modelFor,
    async generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>> {
      const key = keyFor(req.sensitivity);
      if (!key) throw new LlmUnavailableError(req.sensitivity);
      let call = connections.get(req.sensitivity);
      if (!call) {
        call = connect(key);
        connections.set(req.sensitivity, call);
      }
      const model = modelFor(req.sensitivity);
      const parts: Part[] = [
        ...(req.images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.dataBase64 } })),
        { text: req.prompt },
      ];
      const params: GenerateContentParameters = {
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: req.system,
          responseMimeType: 'application/json',
          responseJsonSchema: toResponseJsonSchema(req.schema),
          temperature: 0.2,
          maxOutputTokens: req.maxOutputTokens ?? 2048,
        },
      };

      const usage: LlmUsage = { requests: 0, inputTokens: 0, outputTokens: 0 };
      let failure = { message: 'no attempt made', raw: '' };
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        let res: GeminiResponse;
        try {
          res = await call(params);
        } catch (err) {
          throw toLlmError(err);
        }
        usage.requests += 1;
        usage.inputTokens += res.usageMetadata?.promptTokenCount ?? 0;
        usage.outputTokens += (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
        const parsed = parse(req.schema, res.text);
        if (parsed.ok) return { data: parsed.data, usage, model };
        failure = { message: parsed.message, raw: res.text ?? '' };
      }
      throw new LlmInvalidOutputError(failure.message, failure.raw, usage);
    },
  };
}
```

- [ ] **Step 7: Env и фабрика**

`packages/ai/src/env.ts`:
```ts
import { z } from 'zod';
import { createGeminiClient } from './gemini';
import type { LlmClient } from './types';

const aiEnvSchema = z.object({
  AI_PROVIDER: z.enum(['gemini']).default('gemini'),
  AI_MODEL_PUBLIC: z.string().min(1).default('gemini-flash-lite-latest'),
  AI_MODEL_PRIVATE: z.string().min(1).default('gemini-flash-latest'),
  GEMINI_API_KEY_PUBLIC: z.string().min(1).optional(),
  GEMINI_API_KEY_PRIVATE: z.string().min(1).optional(),
});
export type AiEnv = z.infer<typeof aiEnvSchema>;

export function readAiEnv(env: Record<string, string | undefined> = process.env): AiEnv {
  const pick = (key: keyof AiEnv) => env[key] || undefined;
  return aiEnvSchema.parse({
    AI_PROVIDER: pick('AI_PROVIDER'),
    AI_MODEL_PUBLIC: pick('AI_MODEL_PUBLIC'),
    AI_MODEL_PRIVATE: pick('AI_MODEL_PRIVATE'),
    GEMINI_API_KEY_PUBLIC: pick('GEMINI_API_KEY_PUBLIC'),
    GEMINI_API_KEY_PRIVATE: pick('GEMINI_API_KEY_PRIVATE'),
  });
}

export function createLlmClient(env: AiEnv): LlmClient {
  switch (env.AI_PROVIDER) {
    case 'gemini':
      return createGeminiClient({
        publicKey: env.GEMINI_API_KEY_PUBLIC,
        privateKey: env.GEMINI_API_KEY_PRIVATE,
        publicModel: env.AI_MODEL_PUBLIC,
        privateModel: env.AI_MODEL_PRIVATE,
      });
  }
}
```

- [ ] **Step 8: Фейк и экспорты**

`packages/ai/src/testing.ts`:
```ts
import type { z } from 'zod';
import { LlmInvalidOutputError, LlmUnavailableError } from './errors';
import type { GenerateJsonRequest, GenerateJsonResult, LlmClient, Sensitivity } from './types';

export type FakeRequest = GenerateJsonRequest<z.ZodType>;

/** Deterministic LlmClient for tests: `respond` returns the raw model output (validated by the request schema) or throws. */
export class FakeLlmClient implements LlmClient {
  readonly calls: FakeRequest[] = [];
  private readonly respond: (req: FakeRequest) => unknown;
  private readonly available: readonly Sensitivity[];

  constructor(respond: (req: FakeRequest) => unknown, available: readonly Sensitivity[] = ['public']) {
    this.respond = respond;
    this.available = available;
  }

  isAvailable(sensitivity: Sensitivity): boolean {
    return this.available.includes(sensitivity);
  }

  model(sensitivity: Sensitivity): string {
    return `fake-${sensitivity}`;
  }

  async generateJson<S extends z.ZodType>(req: GenerateJsonRequest<S>): Promise<GenerateJsonResult<z.output<S>>> {
    if (!this.isAvailable(req.sensitivity)) throw new LlmUnavailableError(req.sensitivity);
    this.calls.push(req);
    const raw = await this.respond(req);
    const usage = { requests: 1, inputTokens: 100, outputTokens: 50 };
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new LlmInvalidOutputError('fake output does not match the schema', JSON.stringify(raw), usage);
    return { data: parsed.data, usage, model: this.model(req.sensitivity) };
  }
}
```

`packages/ai/src/index.ts`:
```ts
export * from './types';
export * from './errors';
export * from './json-schema';
export * from './gemini';
export * from './env';
```

- [ ] **Step 9: Прогнать тесты и typecheck**

Run: `pnpm --filter @jp/ai test && pnpm --filter @jp/ai typecheck`
Expected: PASS (json-schema 2, gemini 8, env 2). Если `z.toJSONSchema` на текущей Zod не даёт `anyOf` для nullable, поправить ожидание теста по фактическому выводу, сохранив смысл: nullable-поле разрешает `null`.

- [ ] **Step 10: Commit**

```bash
git add packages/ai pnpm-lock.yaml
git commit -m "feat(ai): provider-agnostic LlmClient with Gemini and per-sensitivity keys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `packages/ai` — обогащение вакансии и «почему подходит»

**Files:**
- Create: `packages/ai/src/tasks/enrich-job.ts`, `packages/ai/src/tasks/explain-matches.ts`
- Modify: `packages/ai/src/index.ts`
- Test: `packages/ai/src/tasks/enrich-job.test.ts`, `packages/ai/src/tasks/explain-matches.test.ts`

**Interfaces:**
- Consumes: `LlmClient`, `LlmUsage` (Task 3); `salaryToMonthlyUsd`, `normalizeRemoteRegions`, `SALARY_PERIODS`, `REMOTE_REGIONS`, `REMOTE_TYPES`, `SENIORITIES`, `type LocalizedText`, `type Locale`, `type RemoteType`, `type Seniority` из `@jp/core` (Task 1).
- Produces:
  - `enrichWireSchema` (Zod), `type EnrichJobInput = { title: string; company: string; location: string | null; salaryRaw: string | null; tags: string[]; descriptionText: string }`.
  - `type JobEnrichment = { isJob: boolean; role: string | null; seniority: Seniority | null; skills: string[]; salaryMinUsd: number | null; salaryMaxUsd: number | null; remoteType: RemoteType; remoteRegions: string[]; lang: string | null; summary: LocalizedText }`.
  - `normalizeEnrichment(w: z.output<typeof enrichWireSchema>): JobEnrichment`, `buildEnrichPrompt(input: EnrichJobInput): string`.
  - `enrichJob(llm: LlmClient, input: EnrichJobInput): Promise<{ enrichment: JobEnrichment; usage: LlmUsage; model: string }>`.
  - `type ExplainCriteria = { keywords: string[]; skills: string[]; seniority: Seniority[]; remoteType: 'any' | 'remote' | 'hybrid' | 'office'; salaryMinUsd: number | null }`.
  - `type ExplainJob = { id: string; title: string; company: string; summary: string | null; skills: string[]; matchedSkills: string[]; seniority: Seniority | null; remoteType: RemoteType; location: string | null; salaryMinUsd: number | null; salaryMaxUsd: number | null }`.
  - `EXPLAIN_BATCH = 10`; `explainMatches(llm, { locale: Locale; criteria: ExplainCriteria; jobs: ExplainJob[] }): Promise<{ explanations: Map<string, string>; usage: LlmUsage; model: string }>` (бросает `RangeError` при `jobs.length > EXPLAIN_BATCH`).

- [ ] **Step 1: Падающие тесты обогащения**

`packages/ai/src/tasks/enrich-job.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import { buildEnrichPrompt, enrichJob, normalizeEnrichment, type EnrichJobInput } from './enrich-job';

const wire = {
  is_job: true,
  role: '  Frontend Developer ',
  seniority: 'senior',
  skills: ['React', ' react ', 'TypeScript', '', 'x'.repeat(41)],
  salary: { min: 4500, max: 5500, currency: 'EUR', period: 'month' },
  remote_type: 'remote',
  remote_regions: ['Europe', 'eu', 'Mars'],
  lang: 'EN',
  summary: { en: ' Builds the checkout. ', uk: 'Створює оформлення замовлення.', ru: '' },
} as const;

const input: EnrichJobInput = {
  title: 'Senior Frontend Developer',
  company: 'Acme',
  location: 'Remote (EU)',
  salaryRaw: '€4,500–5,500',
  tags: ['react'],
  descriptionText: 'a'.repeat(10_000),
};

describe('normalizeEnrichment', () => {
  it('cleans and converts the model output', () => {
    expect(normalizeEnrichment(structuredClone(wire) as never)).toEqual({
      isJob: true,
      role: 'Frontend Developer',
      seniority: 'senior',
      skills: ['React', 'TypeScript'],
      salaryMinUsd: 4860,
      salaryMaxUsd: 5940,
      remoteType: 'remote',
      remoteRegions: ['europe', 'eu'],
      lang: 'en',
      summary: { en: 'Builds the checkout.', uk: 'Створює оформлення замовлення.' },
    });
  });

  it('caps skills at 15 and nulls an empty role, unknown salary and bad language', () => {
    const many = Array.from({ length: 20 }, (_, i) => `Skill${i}`);
    const out = normalizeEnrichment({ ...structuredClone(wire), role: ' ', skills: many, salary: null, lang: 'english' } as never);
    expect(out.skills).toHaveLength(15);
    expect(out.role).toBeNull();
    expect(out.salaryMinUsd).toBeNull();
    expect(out.lang).toBeNull();
  });
});

describe('enrichJob', () => {
  it('sends a public request with a truncated description', async () => {
    const llm = new FakeLlmClient(() => wire);
    const res = await enrichJob(llm, input);
    expect(res.enrichment.role).toBe('Frontend Developer');
    expect(res.usage.requests).toBe(1);
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.sensitivity).toBe('public');
    expect(llm.calls[0]!.prompt).toContain('Senior Frontend Developer');
    expect(llm.calls[0]!.prompt).toContain('Acme');
    expect(llm.calls[0]!.prompt.length).toBeLessThan(7_000);
  });

  it('marks missing optional fields in the prompt', () => {
    const prompt = buildEnrichPrompt({ ...input, location: null, salaryRaw: null, tags: [] });
    expect(prompt).toContain('Location: (not stated)');
    expect(prompt).toContain('Salary: (not stated)');
  });
});
```

- [ ] **Step 2: Падающие тесты пояснений**

`packages/ai/src/tasks/explain-matches.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeLlmClient } from '../testing';
import { explainMatches, type ExplainCriteria, type ExplainJob } from './explain-matches';

const criteria: ExplainCriteria = { keywords: ['frontend'], skills: ['React'], seniority: ['senior'], remoteType: 'remote', salaryMinUsd: 4000 };
const job = (id: string): ExplainJob => ({
  id,
  title: `Frontend ${id}`,
  company: 'Acme',
  summary: 'Payments team.',
  skills: ['React', 'Kafka'],
  matchedSkills: ['React'],
  seniority: 'senior',
  remoteType: 'remote',
  location: null,
  salaryMinUsd: 5000,
  salaryMaxUsd: null,
});

describe('explainMatches', () => {
  it('numbers jobs, asks in the user language and maps answers back by number', async () => {
    const llm = new FakeLlmClient(() => ({
      items: [
        { n: 2, why: ' React і senior — як у вашому пошуку. ' },
        { n: 1, why: 'Підходить за React.' },
        { n: 7, why: 'unknown number' },
        { n: 3, why: '  ' },
      ],
    }));
    const res = await explainMatches(llm, { locale: 'uk', criteria, jobs: [job('a'), job('b'), job('c')] });
    expect([...res.explanations.entries()]).toEqual([
      ['b', 'React і senior — як у вашому пошуку.'],
      ['a', 'Підходить за React.'],
    ]);
    expect(llm.calls[0]!.sensitivity).toBe('public');
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.prompt).toMatch(/^#1 Frontend a/m);
    expect(llm.calls[0]!.prompt).toMatch(/^#3 Frontend c/m);
    expect(llm.calls[0]!.prompt).toContain('frontend');
  });

  it('refuses more than ten jobs per call', async () => {
    const llm = new FakeLlmClient(() => ({ items: [] }));
    const jobs = Array.from({ length: 11 }, (_, i) => job(String(i)));
    await expect(explainMatches(llm, { locale: 'en', criteria, jobs })).rejects.toBeInstanceOf(RangeError);
    expect(llm.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Убедиться, что падают**

Run: `pnpm --filter @jp/ai test`
Expected: FAIL — модулей `./enrich-job`, `./explain-matches` нет.

- [ ] **Step 4: `enrich-job.ts`**

`packages/ai/src/tasks/enrich-job.ts`:
```ts
import {
  LOCALES,
  type LocalizedText,
  normalizeRemoteRegions,
  REMOTE_REGIONS,
  REMOTE_TYPES,
  type RemoteType,
  SALARY_PERIODS,
  salaryToMonthlyUsd,
  SENIORITIES,
  type Seniority,
} from '@jp/core';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../types';

/** What the model returns. Plain schema (no transforms): it is sent as JSON Schema. */
export const enrichWireSchema = z.object({
  is_job: z.boolean().describe('false if this is not one concrete vacancy: a course, an ad, a list of many roles, spam'),
  role: z.string().describe('Normalized role title in English without seniority, e.g. "Frontend Developer", "Accountant"'),
  seniority: z.enum(SENIORITIES).nullable().describe('Required level; null if not stated'),
  skills: z.array(z.string()).describe('Up to 15 concrete required skills/tools, canonical names, e.g. "React", "PostgreSQL", "Excel"'),
  salary: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable().describe('ISO 4217 code, e.g. USD, EUR, UAH, PLN, GBP'),
      period: z.enum(SALARY_PERIODS).nullable(),
    })
    .nullable()
    .describe('Gross salary as stated in the posting; null if absent'),
  remote_type: z.enum(REMOTE_TYPES),
  remote_regions: z
    .array(z.string())
    .describe(
      `For remote jobs: where candidates may live. "worldwide" if unrestricted, else region codes (${REMOTE_REGIONS.join(', ')}) or ISO 3166-1 alpha-2 country codes. Empty if not stated.`,
    ),
  lang: z.string().describe('ISO 639-1 code of the posting language'),
  summary: z
    .object({ en: z.string(), uk: z.string(), ru: z.string() })
    .describe('Two short factual sentences about the role and the company, in English, Ukrainian and Russian'),
});
export type EnrichWire = z.output<typeof enrichWireSchema>;

export type EnrichJobInput = {
  title: string;
  company: string;
  location: string | null;
  salaryRaw: string | null;
  tags: string[];
  descriptionText: string;
};

export type JobEnrichment = {
  isJob: boolean;
  role: string | null;
  seniority: Seniority | null;
  skills: string[];
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  remoteType: RemoteType;
  remoteRegions: string[];
  lang: string | null;
  summary: LocalizedText;
};

const MAX_DESCRIPTION = 6000;
const MAX_SKILLS = 15;

const SYSTEM = [
  'You extract structured facts from ONE job posting for a job search app.',
  'Use only information present in the posting; never guess a salary, level or region that is not stated.',
  'Skills: concrete technologies, tools or professional skills the candidate needs, not soft-skill fluff.',
  'Summaries: plain and factual, no marketing language, no emojis.',
].join('\n');

export function buildEnrichPrompt(input: EnrichJobInput): string {
  const missing = '(not stated)';
  return [
    `Title: ${input.title}`,
    `Company: ${input.company}`,
    `Location: ${input.location ?? missing}`,
    `Salary: ${input.salaryRaw ?? missing}`,
    `Tags: ${input.tags.length > 0 ? input.tags.join(', ') : missing}`,
    'Description:',
    input.descriptionText.slice(0, MAX_DESCRIPTION),
  ].join('\n');
}

function cleanSkills(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const skill = value.trim();
    const key = skill.toLowerCase();
    if (!skill || skill.length > 40 || seen.has(key)) continue;
    seen.add(key);
    out.push(skill);
    if (out.length >= MAX_SKILLS) break;
  }
  return out;
}

export function normalizeEnrichment(w: EnrichWire): JobEnrichment {
  const salary = w.salary ? salaryToMonthlyUsd(w.salary) : null;
  const summary: LocalizedText = {};
  for (const locale of LOCALES) {
    const text = w.summary[locale].trim().slice(0, 400);
    if (text) summary[locale] = text;
  }
  const role = w.role.trim().slice(0, 80);
  const lang = w.lang.trim().toLowerCase();
  return {
    isJob: w.is_job,
    role: role || null,
    seniority: w.seniority,
    skills: cleanSkills(w.skills),
    salaryMinUsd: salary?.minUsd ?? null,
    salaryMaxUsd: salary?.maxUsd ?? null,
    remoteType: w.remote_type,
    remoteRegions: normalizeRemoteRegions(w.remote_regions),
    lang: /^[a-z]{2}$/.test(lang) ? lang : null,
    summary,
  };
}

export async function enrichJob(
  llm: LlmClient,
  input: EnrichJobInput,
): Promise<{ enrichment: JobEnrichment; usage: LlmUsage; model: string }> {
  const res = await llm.generateJson({
    sensitivity: 'public',
    schema: enrichWireSchema,
    system: SYSTEM,
    prompt: buildEnrichPrompt(input),
    maxOutputTokens: 1500,
  });
  return { enrichment: normalizeEnrichment(res.data), usage: res.usage, model: res.model };
}
```

- [ ] **Step 5: `explain-matches.ts`**

`packages/ai/src/tasks/explain-matches.ts`:
```ts
import type { Locale, RemoteType, Seniority } from '@jp/core';
import { z } from 'zod';
import type { LlmClient, LlmUsage } from '../types';

export const EXPLAIN_BATCH = 10;

export const explainWireSchema = z.object({
  items: z.array(z.object({ n: z.number().describe('Job number from the list'), why: z.string() })),
});

/** The user's search criteria only: no name, contacts, CV or country (public-key data, see spec 12.2). */
export type ExplainCriteria = {
  keywords: string[];
  skills: string[];
  seniority: Seniority[];
  remoteType: 'any' | 'remote' | 'hybrid' | 'office';
  salaryMinUsd: number | null;
};

export type ExplainJob = {
  id: string;
  title: string;
  company: string;
  summary: string | null;
  skills: string[];
  matchedSkills: string[];
  seniority: Seniority | null;
  remoteType: RemoteType;
  location: string | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
};

const LANGUAGE: Record<Locale, string> = { en: 'English', uk: 'Ukrainian', ru: 'Russian' };

function system(locale: Locale): string {
  return [
    'You help a job seeker scan a list of vacancies picked for them.',
    `For each numbered job write ONE sentence (at most 25 words) in ${LANGUAGE[locale]} on why it fits their search.`,
    'Name concrete overlaps: skills, level, work format, salary. Use only the data given; never invent facts.',
    'No greetings, no generic praise. Return an item for every job number.',
  ].join('\n');
}

function money(min: number | null, max: number | null): string {
  if (min && max && min !== max) return `$${min}-${max}/month`;
  if (min || max) return `$${min ?? max}/month`;
  return 'not stated';
}

function prompt(criteria: ExplainCriteria, jobs: ExplainJob[]): string {
  const lines = [
    'Search criteria:',
    `- keywords: ${criteria.keywords.join(', ') || 'none'}`,
    `- skills: ${criteria.skills.join(', ') || 'none'}`,
    `- level: ${criteria.seniority.join(', ') || 'any'}`,
    `- format: ${criteria.remoteType}`,
    `- minimum salary: ${criteria.salaryMinUsd ? `$${criteria.salaryMinUsd}/month` : 'not set'}`,
    '',
    'Jobs:',
  ];
  jobs.forEach((job, i) => {
    lines.push(
      `#${i + 1} ${job.title} at ${job.company}`,
      `  level: ${job.seniority ?? 'not stated'}; format: ${job.remoteType}${job.location ? `; location: ${job.location}` : ''}`,
      `  salary: ${money(job.salaryMinUsd, job.salaryMaxUsd)}`,
      `  skills: ${job.skills.join(', ') || 'not stated'}; matching the search: ${job.matchedSkills.join(', ') || 'none'}`,
      `  about: ${job.summary ?? 'n/a'}`,
    );
  });
  return lines.join('\n');
}

export async function explainMatches(
  llm: LlmClient,
  args: { locale: Locale; criteria: ExplainCriteria; jobs: ExplainJob[] },
): Promise<{ explanations: Map<string, string>; usage: LlmUsage; model: string }> {
  if (args.jobs.length > EXPLAIN_BATCH) throw new RangeError(`explainMatches takes at most ${EXPLAIN_BATCH} jobs`);
  const res = await llm.generateJson({
    sensitivity: 'public',
    schema: explainWireSchema,
    system: system(args.locale),
    prompt: prompt(args.criteria, args.jobs),
    maxOutputTokens: 1200,
  });
  const explanations = new Map<string, string>();
  for (const item of res.data.items) {
    const job = Number.isInteger(item.n) ? args.jobs[item.n - 1] : undefined;
    const why = item.why.trim().slice(0, 240);
    if (job && why && !explanations.has(job.id)) explanations.set(job.id, why);
  }
  return { explanations, usage: res.usage, model: res.model };
}
```

В `packages/ai/src/index.ts` добавить:
```ts
export * from './tasks/enrich-job';
export * from './tasks/explain-matches';
```

- [ ] **Step 6: Прогнать тесты и typecheck**

Run: `pnpm --filter @jp/ai test && pnpm --filter @jp/ai typecheck`
Expected: PASS. Проверка зарплаты: 4500 € × 1.08 = 4860, 5500 € × 1.08 = 5940.

- [ ] **Step 7: Commit**

```bash
git add packages/ai
git commit -m "feat(ai): job enrichment and match explanation prompts with normalized output

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Конвейер — обогащение, рескоринг, учёт квоты, задача Trigger.dev, CLI

**Files:**
- Create: `apps/jobs/src/pipeline/ai-repository.ts`, `apps/jobs/src/pipeline/rescore.ts`, `apps/jobs/src/pipeline/enrich.ts`, `apps/jobs/src/trigger/enrich-jobs.ts`, `apps/jobs/src/cli/enrich-once.ts`
- Modify: `apps/jobs/package.json`, `apps/jobs/src/env.ts`, `apps/jobs/src/runtime.ts`, `apps/jobs/src/pipeline/repository.ts`, `apps/jobs/src/pipeline/run-query.ts`, `apps/jobs/src/trigger/queues.ts`, `apps/jobs/.env.example`
- Test: `apps/jobs/test/enrich.int.test.ts`

**Interfaces:**
- Consumes: `enrichJob`, `JobEnrichment`, `LlmClient`, `LlmUsage`, `Sensitivity`, ошибки `Llm*`, `createLlmClient`, `readAiEnv` (`@jp/ai`), `FakeLlmClient` (`@jp/ai/testing`); `scoreJob`, `defaultSources` (`@jp/core`); SQL-функции и колонки из Task 2.
- Produces:
  - `repository.ts`: `toSearchProfile` заполняет `candidateCountry`; `getScorableJobs(db, jobIds: string[]): Promise<{ jobId: string; job: ScorableJob; sources: SourceId[] }[]>`; `getRecentJobs` возвращает AI-поля.
  - `ai-repository.ts`: `utcDay(now: Date): string`, `type EnrichCandidate`, `getJobsToEnrich(db, limit, onlyJobIds?)`, `enrichmentPatch(job, e, now)`, `saveEnrichment(db, jobId, patch)`, `recordEnrichFailure(db, job, message)`, `getAiRequestsToday(db, now, sensitivity)`, `recordAiUsage(db, now, sensitivity, model, usage)`.
  - `rescore.ts`: `rescoreJobs(db, jobIds: string[]): Promise<number>` (сколько `'new'` строк записано).
  - `enrich.ts`: `type AiDeps = { db: Db; llm: LlmClient; dailyLimit: number; minIntervalMs?: number; timeBudgetMs?: number; now?: () => Date; sleep?: (ms: number) => Promise<void> }`; `type AiStatus = 'ok' | 'unavailable' | 'daily_limit' | 'rate_limited' | 'provider_error'`; `type EnrichDeps = AiDeps & { batchSize: number; onlyJobIds?: string[] }`; `type EnrichResult = { status: AiStatus; enriched: number; notJobs: number; failed: number; rescored: number; retryAfterMs: number | null }`; `enrichJobs(deps: EnrichDeps): Promise<EnrichResult>`; `pacer(deps: AiDeps): () => Promise<void>`.
  - `runtime.ts`: `aiDeps(): AiDeps & { batchSize: number }`.
  - `queues.ts`: `AI_PUBLIC_QUEUE`.
  - Trigger: `enrich-jobs` (cron `*/15 * * * *`).
  - CLI: `pnpm --filter @jp/jobs enrich-once [--limit=N]`.

- [ ] **Step 1: Зависимость и env**

В `apps/jobs/package.json` в `dependencies` добавить `"@jp/ai": "workspace:*"`, в `scripts` — `"enrich-once": "tsx src/cli/enrich-once.ts"`. Run: `pnpm install`.

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
      AI_DAILY_LIMIT: z.coerce.number().int().min(0).default(900),
      AI_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(30),
      AI_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(4500),
    })
    .parse({
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
      SCRAPER_USER_AGENT: process.env.SCRAPER_USER_AGENT || undefined,
      JOOBLE_API_KEY: process.env.JOOBLE_API_KEY || undefined,
      AI_DAILY_LIMIT: process.env.AI_DAILY_LIMIT || undefined,
      AI_BATCH_SIZE: process.env.AI_BATCH_SIZE || undefined,
      AI_MIN_INTERVAL_MS: process.env.AI_MIN_INTERVAL_MS || undefined,
    });
}
```

В `apps/jobs/.env.example` дописать:
```
# AI (Google AI Studio → aistudio.google.com/apikey). PUBLIC = free tier, job postings only.
GEMINI_API_KEY_PUBLIC=
# PRIVATE = paid tier (no training on data) for CVs/emails/screenshots — later plans; leave empty for now
GEMINI_API_KEY_PRIVATE=
# Optional overrides
AI_MODEL_PUBLIC=
AI_MODEL_PRIVATE=
AI_DAILY_LIMIT=
AI_BATCH_SIZE=
AI_MIN_INTERVAL_MS=
```

- [ ] **Step 2: Падающий интеграционный тест**

`apps/jobs/test/enrich.int.test.ts`:
```ts
import { LlmRateLimitError } from '@jp/ai';
import { FakeLlmClient, type FakeRequest } from '@jp/ai/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { getAiRequestsToday } from '../src/pipeline/ai-repository';
import { enrichJobs, type EnrichDeps } from '../src/pipeline/enrich';
import { matchJobs } from '../src/pipeline/match';
import { getProfile, getScorableJobs } from '../src/pipeline/repository';

const db = getDb();
const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let userId: string;
let profileId: string;
let companyId: string;

const aiOutput = (over: Record<string, unknown> = {}) => ({
  is_job: true,
  role: 'Full Stack Developer',
  seniority: 'middle',
  skills: ['React', 'Kafka'],
  salary: { min: 3000, max: 4000, currency: 'USD', period: 'month' },
  remote_type: 'remote',
  remote_regions: ['europe'],
  lang: 'en',
  summary: { en: 'Builds a payments platform.', uk: 'Будує платіжну платформу.', ru: 'Строит платёжную платформу.' },
  ...over,
});

/** Inserts an active DOU job and lets the real matcher create this user's match for it. */
async function seedJob(marker: string, patch: Record<string, unknown> = {}): Promise<string> {
  const { data: job, error } = await db
    .from('jobs')
    .insert({
      fingerprint: `enrich-${marker}-${uniq}`,
      title: `Full Stack Developer ${marker}-${uniq}`,
      company_id: companyId,
      description_text: 'We use React. Remote.',
      remote_type: 'remote',
      ...patch,
    })
    .select('id')
    .single();
  if (error) throw error;
  const { error: postingError } = await db
    .from('job_postings')
    .insert({ job_id: job.id, source_id: 'dou', external_id: `enrich-${marker}-${uniq}`, url: `https://jobs.dou.ua/vacancies/${marker}-${uniq}/` });
  if (postingError) throw postingError;
  const profile = (await getProfile(db, profileId))!;
  await matchJobs(db, [profile], await getScorableJobs(db, [job.id]));
  return job.id;
}

async function matchOf(jobId: string) {
  const { data, error } = await db
    .from('job_matches')
    .select('score, state, breakdown')
    .eq('user_id', userId)
    .eq('job_id', jobId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as {
    score: number;
    state: string;
    breakdown: { matchedSkills: string[]; excludedBy: string | null; blockedRegions: string[] | null };
  } | null;
}

const markerOf = (req: FakeRequest) => req.prompt.match(/Full Stack Developer (\w+)-/)?.[1] ?? '';
const deps = (llm: FakeLlmClient, onlyJobIds: string[], over: Partial<EnrichDeps> = {}): EnrichDeps => ({
  db,
  llm,
  dailyLimit: 1_000_000,
  batchSize: 10,
  minIntervalMs: 0,
  onlyJobIds,
  ...over,
});

beforeAll(async () => {
  const { data: user, error } = await db.auth.admin.createUser({ email: `enrich-${uniq}@e2e.test`, email_confirm: true });
  if (error) throw error;
  userId = user.user.id;
  const { error: countryError } = await db.from('profiles').update({ country: 'UA' }).eq('id', userId);
  if (countryError) throw countryError;
  const { data: sp, error: spError } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'FS', keywords: ['full stack'], skills: ['React', 'Kafka'], remote_type: 'remote', sources: ['dou'] })
    .select('id')
    .single();
  if (spError) throw spError;
  profileId = sp.id;
  const { data: company, error: cError } = await db
    .from('companies')
    .insert({ name: `Enrich ${uniq}`, normalized_name: `enrich ${uniq}` })
    .select('id')
    .single();
  if (cError) throw cError;
  companyId = company.id;
});

describe('enrichJobs', () => {
  it('enriches matched jobs, fills only gaps, and rescores', async () => {
    const ids = {
      gap: await seedJob('gap'),
      keep: await seedJob('keep', { seniority: 'senior', salary_min_usd: 5000, salary_max_usd: 6000 }),
      course: await seedJob('course'),
      usonly: await seedJob('usonly'),
    };
    const before = await matchOf(ids.gap);
    expect(before?.breakdown.matchedSkills).toEqual(['React']);

    const llm = new FakeLlmClient((req) => {
      const marker = markerOf(req);
      if (marker === 'course') return aiOutput({ is_job: false });
      if (marker === 'usonly') return aiOutput({ remote_regions: ['us'] });
      if (marker === 'keep') return aiOutput({ seniority: 'junior', salary: { min: 1000, max: null, currency: 'USD', period: 'month' } });
      return aiOutput();
    });
    const result = await enrichJobs(deps(llm, Object.values(ids)));
    expect(result).toMatchObject({ status: 'ok', enriched: 4, notJobs: 1, failed: 0 });
    expect(llm.calls.every((c) => c.sensitivity === 'public')).toBe(true);

    const { data: rows } = await db
      .from('jobs')
      .select('id, role, skills, summary, seniority, salary_min_usd, salary_max_usd, is_job, remote_regions, enriched_at, lang')
      .in('id', Object.values(ids));
    const row = (id: string) => rows!.find((r) => r.id === id)!;
    expect(row(ids.gap)).toMatchObject({ role: 'Full Stack Developer', skills: ['React', 'Kafka'], seniority: 'middle', salary_min_usd: 3000, salary_max_usd: 4000, is_job: true, lang: 'en' });
    expect((row(ids.gap).summary as { en: string }).en).toBe('Builds a payments platform.');
    expect(row(ids.gap).enriched_at).not.toBeNull();
    expect(row(ids.keep)).toMatchObject({ seniority: 'senior', salary_min_usd: 5000, salary_max_usd: 6000 });
    expect(row(ids.course).is_job).toBe(false);

    const after = await matchOf(ids.gap);
    expect(after!.breakdown.matchedSkills).toEqual(['React', 'Kafka']);
    expect(after!.score).toBeGreaterThan(before!.score);
    expect(await matchOf(ids.course)).toBeNull();
    const blocked = await matchOf(ids.usonly);
    expect(blocked).toMatchObject({ state: 'hidden', breakdown: { excludedBy: 'region', blockedRegions: ['us'] } });

    const scorable = await getScorableJobs(db, [ids.course, ids.usonly]);
    expect(scorable.find((s) => s.jobId === ids.course)!.job.isJob).toBe(false);
    expect(scorable.find((s) => s.jobId === ids.usonly)!.job.remoteRegions).toEqual(['us']);
    expect(await getAiRequestsToday(db, new Date(), 'public')).toBeGreaterThanOrEqual(4);
  });

  it('stops on a rate limit without penalising the remaining job', async () => {
    const ids = [await seedJob('rl1'), await seedJob('rl2')];
    let calls = 0;
    const llm = new FakeLlmClient(() => {
      calls += 1;
      if (calls === 2) throw new LlmRateLimitError('quota exceeded', 30_000);
      return aiOutput();
    });
    const result = await enrichJobs(deps(llm, ids));
    expect(result).toMatchObject({ status: 'rate_limited', enriched: 1, retryAfterMs: 30_000 });
    const { data } = await db.from('jobs').select('enriched_at, enrich_attempts').in('id', ids);
    expect(data!.filter((j) => j.enriched_at !== null)).toHaveLength(1);
    expect(data!.find((j) => j.enriched_at === null)!.enrich_attempts).toBe(0);
  });

  it('counts a failed attempt on invalid output', async () => {
    const id = await seedJob('bad');
    const result = await enrichJobs(deps(new FakeLlmClient(() => ({ nonsense: true })), [id]));
    expect(result).toMatchObject({ status: 'ok', enriched: 0, failed: 1 });
    const { data } = await db.from('jobs').select('enriched_at, enrich_attempts, enrich_error').eq('id', id).single();
    expect(data).toMatchObject({ enriched_at: null, enrich_attempts: 1 });
    expect(data!.enrich_error).toContain('schema');
  });

  it('respects the daily limit and a missing key', async () => {
    const id = await seedJob('limit');
    const used = await getAiRequestsToday(db, new Date(), 'public');
    const llm = new FakeLlmClient(() => aiOutput());
    expect(await enrichJobs(deps(llm, [id], { dailyLimit: used }))).toMatchObject({ status: 'daily_limit', enriched: 0 });
    expect(await enrichJobs(deps(new FakeLlmClient(() => aiOutput(), []), [id]))).toMatchObject({ status: 'unavailable' });
    expect(llm.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Убедиться, что падает**

Run: `pnpm --filter @jp/jobs test:integration -- enrich`
Expected: FAIL — нет `../src/pipeline/ai-repository`, `../src/pipeline/enrich`, `getScorableJobs`.

- [ ] **Step 4: Репозиторий — страна, AI-поля в скоринге**

В `apps/jobs/src/pipeline/repository.ts`:
- В `ProfileRow` добавить `profiles?: { country: string | null } | null;`.
- `PROFILE_COLUMNS` дописать `, profiles(country)`:
```ts
const PROFILE_COLUMNS =
  'id, user_id, keywords, skills, exclude_keywords, seniority, locations, remote_type, salary_min_usd, sources, is_active, profiles(country)';
```
- В `toSearchProfile` добавить поле `candidateCountry: row.profiles?.country ?? null,`.
- Вынести маппинг строки вакансии и добавить выборку по id:
```ts
const SCORABLE_COLUMNS =
  'id, title, description_text, tags, remote_type, seniority, location, salary_min_usd, salary_max_usd, skills, is_job, remote_regions';

type ScorableRow = {
  id: string;
  title: string;
  description_text: string;
  tags: string[];
  remote_type: string;
  seniority: string | null;
  location: string | null;
  salary_min_usd: number | null;
  salary_max_usd: number | null;
  skills: string[];
  is_job: boolean | null;
  remote_regions: string[];
};

function toScorableJob(j: ScorableRow): ScorableJob {
  return {
    title: j.title,
    descriptionText: j.description_text,
    tags: j.tags,
    remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === j.remote_type) ?? 'unknown',
    seniority: (SENIORITIES as readonly string[]).includes(j.seniority ?? '') ? (j.seniority as Seniority) : null,
    location: j.location,
    salaryMinUsd: j.salary_min_usd,
    salaryMaxUsd: j.salary_max_usd,
    skills: j.skills,
    isJob: j.is_job,
    remoteRegions: j.remote_regions,
  };
}

/** Jobs as stored (incl. backfills and AI enrichment) with the sources they were seen on. */
export async function getScorableJobs(
  db: Db,
  jobIds: string[],
): Promise<{ jobId: string; job: ScorableJob; sources: SourceId[] }[]> {
  const out: { jobId: string; job: ScorableJob; sources: SourceId[] }[] = [];
  const unique = [...new Set(jobIds)];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await db
      .from('jobs')
      .select(`${SCORABLE_COLUMNS}, job_postings(source_id)`)
      .in('id', unique.slice(i, i + 200));
    if (error) throw error;
    for (const j of data) {
      out.push({
        jobId: j.id,
        job: toScorableJob(j),
        sources: j.job_postings
          .map((p) => p.source_id)
          .filter((s): s is SourceId => (SOURCE_IDS as readonly string[]).includes(s)),
      });
    }
  }
  return out;
}
```
- В `getRecentJobs` заменить select на `` `${SCORABLE_COLUMNS}, job_postings!inner(source_id)` `` и маппинг на `data.map((j) => ({ jobId: j.id, job: toScorableJob(j) }))`.

- [ ] **Step 5: run-query матчит по сохранённым данным**

Без этого шага повторно увиденная обогащённая вакансия пересчитывалась бы по сырым данным источника: AI-навыки, `is_job = false` и `remote_regions` терялись бы. В `apps/jobs/src/pipeline/run-query.ts`:
- импорт: `import { getScorableJobs } from './repository';` (добавить в существующий список импортов);
- `saved` можно оставить массивом id: `const savedIds: string[] = [];` и `savedIds.push(result.jobId);` вместо `saved.push(...)`;
- матчинг:
```ts
      matched = await matchJobs(db, await getProfilesForQuery(db, queryId), await getScorableJobs(db, savedIds));
```
Удалить ставший ненужным импорт `type NormalizedJob`, если он используется только для `saved`. Фильтр после `normalizeJob` по-прежнему его использует — оставить, если нужен.

- [ ] **Step 6: `ai-repository.ts`**

`apps/jobs/src/pipeline/ai-repository.ts`:
```ts
import type { JobEnrichment, LlmUsage, Sensitivity } from '@jp/ai';
import { type RemoteType, SENIORITIES, type Seniority } from '@jp/core';
import type { Json, TablesUpdate } from '@jp/db';
import type { Db } from '../db';

/** AI quotas and our counters run on UTC days. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export type EnrichCandidate = {
  id: string;
  title: string;
  company: string;
  descriptionText: string;
  location: string | null;
  salaryRaw: string | null;
  tags: string[];
  remoteType: RemoteType;
  seniority: Seniority | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  enrichAttempts: number;
};

export async function getJobsToEnrich(db: Db, limit: number, onlyJobIds?: string[]): Promise<EnrichCandidate[]> {
  const { data: ids, error } = await db.rpc('jobs_to_enrich', {
    p_limit: limit,
    ...(onlyJobIds ? { p_job_ids: onlyJobIds } : {}),
  });
  if (error) throw error;
  if (ids.length === 0) return [];
  const { data, error: jobsError } = await db
    .from('jobs')
    .select(
      'id, title, description_text, location, salary_raw, tags, remote_type, seniority, salary_min_usd, salary_max_usd, enrich_attempts, companies(name)',
    )
    .in('id', ids);
  if (jobsError) throw jobsError;
  const byId = new Map(data.map((j) => [j.id, j]));
  return ids.flatMap((id) => {
    const j = byId.get(id);
    if (!j) return [];
    return [
      {
        id: j.id,
        title: j.title,
        company: j.companies?.name ?? '',
        descriptionText: j.description_text,
        location: j.location,
        salaryRaw: j.salary_raw,
        tags: j.tags,
        remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === j.remote_type) ?? 'unknown',
        seniority: (SENIORITIES as readonly string[]).includes(j.seniority ?? '') ? (j.seniority as Seniority) : null,
        salaryMinUsd: j.salary_min_usd,
        salaryMaxUsd: j.salary_max_usd,
        enrichAttempts: j.enrich_attempts,
      },
    ];
  });
}

/** AI fills gaps; it never overrides a level, work format or salary the source already gave us. */
export function enrichmentPatch(job: EnrichCandidate, e: JobEnrichment, now: Date): TablesUpdate<'jobs'> {
  const hasSalary = job.salaryMinUsd != null || job.salaryMaxUsd != null;
  const aiSalary = e.salaryMinUsd != null || e.salaryMaxUsd != null;
  return {
    role: e.role,
    skills: e.skills,
    lang: e.lang,
    summary: e.summary as Json,
    remote_regions: e.remoteRegions,
    is_job: e.isJob,
    seniority: job.seniority ?? e.seniority,
    remote_type: job.remoteType === 'unknown' ? e.remoteType : job.remoteType,
    ...(!hasSalary && aiSalary ? { salary_min_usd: e.salaryMinUsd, salary_max_usd: e.salaryMaxUsd } : {}),
    enriched_at: now.toISOString(),
    enrich_error: null,
  };
}

export async function saveEnrichment(db: Db, jobId: string, patch: TablesUpdate<'jobs'>): Promise<void> {
  const { error } = await db.from('jobs').update(patch).eq('id', jobId);
  if (error) throw error;
}

export async function recordEnrichFailure(db: Db, job: EnrichCandidate, message: string): Promise<void> {
  const { error } = await db
    .from('jobs')
    .update({ enrich_attempts: job.enrichAttempts + 1, enrich_error: message.slice(0, 500) })
    .eq('id', job.id);
  if (error) throw error;
}

export async function getAiRequestsToday(db: Db, now: Date, sensitivity: Sensitivity): Promise<number> {
  const { data, error } = await db.from('ai_usage').select('requests').eq('day', utcDay(now)).eq('sensitivity', sensitivity);
  if (error) throw error;
  return data.reduce((sum, row) => sum + row.requests, 0);
}

export async function recordAiUsage(db: Db, now: Date, sensitivity: Sensitivity, model: string, usage: LlmUsage): Promise<void> {
  if (usage.requests === 0) return;
  const { error } = await db.rpc('record_ai_usage', {
    p_day: utcDay(now),
    p_sensitivity: sensitivity,
    p_model: model,
    p_requests: usage.requests,
    p_input: usage.inputTokens,
    p_output: usage.outputTokens,
  });
  if (error) throw error;
}
```

- [ ] **Step 7: `rescore.ts`**

`apps/jobs/src/pipeline/rescore.ts`:
```ts
import { defaultSources, scoreJob } from '@jp/core';
import type { Db } from '../db';
import { matchJobs } from './match';
import { deleteNewMatches, getActiveProfiles, getScorableJobs } from './repository';

/**
 * Re-scores stored jobs (e.g. after AI enrichment) for every active profile that polls a board the job was seen on,
 * and drops untouched matches that no longer score (not a job, no longer relevant).
 */
export async function rescoreJobs(db: Db, jobIds: string[]): Promise<number> {
  if (jobIds.length === 0) return 0;
  const [profiles, jobs] = await Promise.all([getActiveProfiles(db), getScorableJobs(db, jobIds)]);
  let matched = 0;
  for (const profile of profiles) {
    const enabled = new Set<string>(profile.sources ?? defaultSources(profile.remoteType));
    const eligible = jobs.filter((j) => j.sources.some((s) => enabled.has(s)));
    if (eligible.length === 0) continue;
    matched += await matchJobs(db, [profile], eligible);
    const stale = eligible.filter(({ job }) => scoreJob(profile, job) === null).map(({ jobId }) => jobId);
    await deleteNewMatches(db, profile.id, stale);
  }
  return matched;
}
```

- [ ] **Step 8: `enrich.ts`**

`apps/jobs/src/pipeline/enrich.ts`:
```ts
import { enrichJob, LlmError, LlmInvalidOutputError, type LlmClient, LlmRateLimitError } from '@jp/ai';
import type { Db } from '../db';
import {
  enrichmentPatch,
  getAiRequestsToday,
  getJobsToEnrich,
  recordAiUsage,
  recordEnrichFailure,
  saveEnrichment,
} from './ai-repository';
import { rescoreJobs } from './rescore';

export type AiDeps = {
  db: Db;
  llm: LlmClient;
  /** Requests per UTC day across all public AI work (enrichment + explanations). */
  dailyLimit: number;
  /** Minimum time between request starts (free-tier RPM). */
  minIntervalMs?: number;
  /** Stop starting new requests after this long (Trigger.dev maxDuration headroom). */
  timeBudgetMs?: number;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

export type AiStatus = 'ok' | 'unavailable' | 'daily_limit' | 'rate_limited' | 'provider_error';

export type EnrichDeps = AiDeps & { batchSize: number; onlyJobIds?: string[] };

export type EnrichResult = {
  status: AiStatus;
  enriched: number;
  notJobs: number;
  failed: number;
  rescored: number;
  retryAfterMs: number | null;
};

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns a function to await before each request: keeps request starts minIntervalMs apart. */
export function pacer(deps: AiDeps): () => Promise<void> {
  const sleep = deps.sleep ?? realSleep;
  const interval = deps.minIntervalMs ?? 4500;
  let last = Number.NEGATIVE_INFINITY;
  return async () => {
    const wait = last + interval - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
  };
}

/** Provider trouble that is not the job's fault: stop the batch, keep the job's attempts. */
export function isTransient(err: LlmError): boolean {
  return err.status === null || err.status >= 500;
}

export async function enrichJobs(deps: EnrichDeps): Promise<EnrichResult> {
  const { db, llm } = deps;
  const result: EnrichResult = { status: 'ok', enriched: 0, notJobs: 0, failed: 0, rescored: 0, retryAfterMs: null };
  if (!llm.isAvailable('public')) return { ...result, status: 'unavailable' };

  const now = deps.now?.() ?? new Date();
  const budget = Math.min(deps.batchSize, deps.dailyLimit - (await getAiRequestsToday(db, now, 'public')));
  if (budget <= 0) return { ...result, status: 'daily_limit' };

  const candidates = await getJobsToEnrich(db, budget, deps.onlyJobIds);
  const started = Date.now();
  const deadline = started + (deps.timeBudgetMs ?? 240_000);
  const pace = pacer(deps);
  const done: string[] = [];
  let unexpected: unknown;

  for (const job of candidates) {
    if (Date.now() > deadline) break;
    await pace();
    try {
      const { enrichment, usage, model } = await enrichJob(llm, job);
      await recordAiUsage(db, now, 'public', model, usage);
      await saveEnrichment(db, job.id, enrichmentPatch(job, enrichment, now));
      done.push(job.id);
      result.enriched += 1;
      if (!enrichment.isJob) result.notJobs += 1;
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        result.status = 'rate_limited';
        result.retryAfterMs = err.retryAfterMs;
        break;
      }
      if (err instanceof LlmError && isTransient(err)) {
        result.status = 'provider_error';
        break;
      }
      if (err instanceof LlmError) {
        if (err instanceof LlmInvalidOutputError) await recordAiUsage(db, now, 'public', llm.model('public'), err.usage);
        await recordEnrichFailure(db, job, err.message);
        result.failed += 1;
        continue;
      }
      unexpected = err;
      break;
    }
  }

  // Rescore what was enriched even if the batch stopped early, so finished work reaches users now.
  result.rescored = await rescoreJobs(db, done);
  if (unexpected !== undefined) throw unexpected;
  return result;
}
```

- [ ] **Step 9: Runtime, очередь, задача, CLI**

`apps/jobs/src/runtime.ts` — дописать:
```ts
import { createLlmClient, readAiEnv } from '@jp/ai';
import type { AiDeps } from './pipeline/enrich';

export function aiDeps(): AiDeps & { batchSize: number } {
  const env = jobsEnv();
  return {
    db: getDb(),
    llm: createLlmClient(readAiEnv()),
    dailyLimit: env.AI_DAILY_LIMIT,
    batchSize: env.AI_BATCH_SIZE,
    minIntervalMs: env.AI_MIN_INTERVAL_MS,
  };
}
```
(Импорты добавить к существующим в начало файла.)

`apps/jobs/src/trigger/queues.ts` — дописать:
```ts
/** All free-tier AI work shares one lane: the per-minute quota is per key, not per task. */
export const AI_PUBLIC_QUEUE = queue({ name: 'ai-public', concurrencyLimit: 1 });
```

`apps/jobs/src/trigger/enrich-jobs.ts`:
```ts
import { logger, schedules } from '@trigger.dev/sdk';
import { enrichJobs } from '../pipeline/enrich';
import { aiDeps } from '../runtime';
import { AI_PUBLIC_QUEUE } from './queues';

export const enrichJobsTask = schedules.task({
  id: 'enrich-jobs',
  cron: '*/15 * * * *',
  queue: AI_PUBLIC_QUEUE,
  // A tick that waits behind a long run is dropped instead of piling up.
  ttl: '10m',
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async () => {
    const result = await enrichJobs(aiDeps());
    if (result.status === 'unavailable') logger.warn('GEMINI_API_KEY_PUBLIC is not set; enrichment skipped');
    else logger.info('enrichment', result);
    return result;
  },
});
```

`apps/jobs/src/cli/enrich-once.ts`:
```ts
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const { enrichJobs } = await import('../pipeline/enrich');
const { aiDeps } = await import('../runtime');

const limitArg = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]);
const deps = aiDeps();
const batchSize = Number.isInteger(limitArg) && limitArg > 0 ? limitArg : deps.batchSize;

const result = await enrichJobs({ ...deps, batchSize, timeBudgetMs: Number.POSITIVE_INFINITY });
console.log(`enrichment: ${JSON.stringify(result)}`);
```

- [ ] **Step 10: Прогнать все интеграционные тесты и typecheck**

Run: `pnpm --filter @jp/jobs typecheck && pnpm --filter @jp/jobs test:integration`
Expected: PASS — новые 4 теста `enrich.int.test.ts` и все прежние (`pipeline`, `refresh`), в т. ч. после перевода run-query на `getScorableJobs`.

- [ ] **Step 11: Commit**

```bash
git add apps/jobs pnpm-lock.yaml
git commit -m "feat(jobs): AI enrichment of matched jobs with quota accounting and rescoring

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Конвейер — «почему подходит», расписание, smoke-скрипт, README

**Files:**
- Create: `apps/jobs/src/pipeline/explain.ts`, `apps/jobs/src/cli/ai-smoke.ts`
- Modify: `apps/jobs/src/pipeline/ai-repository.ts`, `apps/jobs/src/trigger/enrich-jobs.ts`, `apps/jobs/src/cli/enrich-once.ts`, `apps/jobs/package.json`, `README.md`
- Test: `apps/jobs/test/explain.int.test.ts`

**Interfaces:**
- Consumes: `explainMatches`, `EXPLAIN_BATCH`, `ExplainCriteria`, `ExplainJob` (Task 4); `AiDeps`, `AiStatus`, `pacer`, `isTransient`, `recordAiUsage`, `getAiRequestsToday` (Task 5); `localized`, `isLocale`, `DEFAULT_LOCALE`, `SEARCH_REMOTE_TYPES`, `SENIORITIES` (`@jp/core`).
- Produces:
  - `ai-repository.ts`: `getMatchesToExplain(db, dayStart: Date, perUser: number, minScore: number, onlyUserIds?: string[]): Promise<{ matchId: string; userId: string; locale: Locale }[]>`; `type ExplainDetail = { matchId: string; profileId: string | null; criteria: ExplainCriteria | null; job: ExplainJob }`; `getExplainDetails(db, matchIds: string[], locale: Locale): Promise<ExplainDetail[]>`; `saveExplanation(db, matchId, locale, text: string | null, now)`.
  - `explain.ts`: `EXPLAIN_PER_USER_DAILY = 20`, `EXPLAIN_MIN_SCORE = 50`, `type ExplainDeps = AiDeps & { perUserLimit?: number; onlyUserIds?: string[] }`, `type ExplainResult = { status: AiStatus; explained: number; requests: number; retryAfterMs: number | null }`, `explainTopMatches(deps): Promise<ExplainResult>`.
  - Trigger: `explain-matches` (cron `40 * * * *`, та же очередь `ai-public`).
  - CLI: `enrich-once` выполняет и пояснения; `pnpm --filter @jp/jobs ai:smoke`.

- [ ] **Step 1: Падающий интеграционный тест**

`apps/jobs/test/explain.int.test.ts`:
```ts
import { FakeLlmClient } from '@jp/ai/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { explainTopMatches, type ExplainDeps } from '../src/pipeline/explain';

const db = getDb();
const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
let userId: string;
const jobIds: Record<string, string> = {};

const llm = new FakeLlmClient((req) => {
  const numbers = [...req.prompt.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]));
  return { items: numbers.map((n) => ({ n, why: `Причина ${n}` })) };
});
const deps = (over: Partial<ExplainDeps> = {}): ExplainDeps => ({
  db,
  llm,
  dailyLimit: 1_000_000,
  minIntervalMs: 0,
  onlyUserIds: [userId],
  ...over,
});

async function explanationOf(key: string) {
  const { data, error } = await db
    .from('job_matches')
    .select('explanation, explained_at')
    .eq('user_id', userId)
    .eq('job_id', jobIds[key]!)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  const { data: user, error } = await db.auth.admin.createUser({ email: `explain-${uniq}@e2e.test`, email_confirm: true });
  if (error) throw error;
  userId = user.user.id;
  await db.from('profiles').update({ locale: 'uk' }).eq('id', userId);
  const { data: sp } = await db
    .from('search_profiles')
    .insert({ user_id: userId, name: 'FE', keywords: ['frontend'], skills: ['React'], remote_type: 'remote', sources: ['dou'] })
    .select('id')
    .single();
  const { data: company } = await db
    .from('companies')
    .insert({ name: `Explain ${uniq}`, normalized_name: `explain ${uniq}` })
    .select('id')
    .single();
  const jobs: [string, number, boolean][] = [
    ['top', 90, true],
    ['second', 80, true],
    ['third', 70, true],
    ['low', 40, true],
    ['raw', 95, false],
  ];
  for (const [key, score, enriched] of jobs) {
    const { data: job, error: jobError } = await db
      .from('jobs')
      .insert({
        fingerprint: `explain-${key}-${uniq}`,
        title: `Frontend ${key} ${uniq}`,
        company_id: company!.id,
        remote_type: 'remote',
        skills: ['React'],
        summary: { en: `About ${key}.` },
        is_job: enriched ? true : null,
        enriched_at: enriched ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (jobError) throw jobError;
    jobIds[key] = job.id;
    const { error: matchError } = await db.from('job_matches').insert({
      user_id: userId,
      job_id: job.id,
      search_profile_id: sp!.id,
      score,
      breakdown: { matchedSkills: ['React'] },
    });
    if (matchError) throw matchError;
  }
});

describe('explainTopMatches', () => {
  it('explains the best enriched matches in the user language within the daily budget', async () => {
    const result = await explainTopMatches(deps({ perUserLimit: 2 }));
    expect(result).toMatchObject({ status: 'ok', explained: 2, requests: 1 });
    expect(llm.calls).toHaveLength(1);
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.prompt).toContain(`Frontend top ${uniq}`);
    expect((await explanationOf('top')).explanation).toEqual({ uk: 'Причина 1' });
    expect((await explanationOf('second')).explanation).toEqual({ uk: 'Причина 2' });
    expect((await explanationOf('raw')).explained_at).toBeNull();
  });

  it('does not exceed the per-user daily budget on a second run', async () => {
    const before = llm.calls.length;
    const result = await explainTopMatches(deps({ perUserLimit: 2 }));
    expect(result).toMatchObject({ status: 'ok', explained: 0, requests: 0 });
    expect(llm.calls).toHaveLength(before);
  });

  it('skips low scores and unenriched jobs', async () => {
    const result = await explainTopMatches(deps());
    expect(result).toMatchObject({ explained: 1 });
    expect((await explanationOf('third')).explanation).toEqual({ uk: 'Причина 1' });
    expect((await explanationOf('low')).explained_at).toBeNull();
    expect((await explanationOf('raw')).explained_at).toBeNull();
  });

  it('reports a missing key without touching anything', async () => {
    expect(await explainTopMatches(deps({ llm: new FakeLlmClient(() => ({ items: [] }), []) }))).toMatchObject({
      status: 'unavailable',
      explained: 0,
    });
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `pnpm --filter @jp/jobs test:integration -- explain`
Expected: FAIL — нет `../src/pipeline/explain`.

- [ ] **Step 3: Репозиторий пояснений** — дописать в `apps/jobs/src/pipeline/ai-repository.ts`:
```ts
import type { ExplainCriteria, ExplainJob } from '@jp/ai';
import { DEFAULT_LOCALE, isLocale, type Locale, type LocalizedText, localized, SEARCH_REMOTE_TYPES } from '@jp/core';
```
(объединить с существующими импортами из `@jp/ai` и `@jp/core`), затем:
```ts
export async function getMatchesToExplain(
  db: Db,
  dayStart: Date,
  perUser: number,
  minScore: number,
  onlyUserIds?: string[],
): Promise<{ matchId: string; userId: string; locale: Locale }[]> {
  const { data, error } = await db.rpc('matches_to_explain', {
    p_day_start: dayStart.toISOString(),
    p_per_user: perUser,
    p_min_score: minScore,
    ...(onlyUserIds ? { p_user_ids: onlyUserIds } : {}),
  });
  if (error) throw error;
  return data.map((r) => ({ matchId: r.match_id, userId: r.user_id, locale: isLocale(r.locale) ? r.locale : DEFAULT_LOCALE }));
}

export type ExplainDetail = { matchId: string; profileId: string | null; criteria: ExplainCriteria | null; job: ExplainJob };

const asStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

export async function getExplainDetails(db: Db, matchIds: string[], locale: Locale): Promise<ExplainDetail[]> {
  if (matchIds.length === 0) return [];
  const { data, error } = await db
    .from('job_matches')
    .select(
      'id, breakdown, search_profile_id, jobs!inner(title, summary, skills, seniority, remote_type, location, salary_min_usd, salary_max_usd, companies(name)), search_profiles(keywords, skills, seniority, remote_type, salary_min_usd)',
    )
    .in('id', matchIds);
  if (error) throw error;
  const order = new Map(matchIds.map((id, i) => [id, i]));
  return data
    .map((m): ExplainDetail => {
      const sp = m.search_profiles;
      const breakdown = (m.breakdown ?? {}) as { matchedSkills?: unknown };
      return {
        matchId: m.id,
        profileId: m.search_profile_id,
        criteria: sp
          ? {
              keywords: sp.keywords,
              skills: sp.skills,
              seniority: sp.seniority.filter((s): s is Seniority => (SENIORITIES as readonly string[]).includes(s)),
              remoteType: SEARCH_REMOTE_TYPES.find((r) => r === sp.remote_type) ?? 'any',
              salaryMinUsd: sp.salary_min_usd,
            }
          : null,
        job: {
          id: m.id,
          title: m.jobs.title,
          company: m.jobs.companies?.name ?? '',
          summary: localized(m.jobs.summary as LocalizedText | null, locale) || null,
          skills: m.jobs.skills,
          matchedSkills: asStrings(breakdown.matchedSkills),
          seniority: (SENIORITIES as readonly string[]).includes(m.jobs.seniority ?? '') ? (m.jobs.seniority as Seniority) : null,
          remoteType: (['remote', 'hybrid', 'office'] as const).find((r) => r === m.jobs.remote_type) ?? 'unknown',
          location: m.jobs.location,
          salaryMinUsd: m.jobs.salary_min_usd,
          salaryMaxUsd: m.jobs.salary_max_usd,
        },
      };
    })
    .sort((a, b) => order.get(a.matchId)! - order.get(b.matchId)!);
}

/** explained_at is set even without a text, so a match the model skipped is not retried every hour. */
export async function saveExplanation(db: Db, matchId: string, locale: Locale, text: string | null, now: Date): Promise<void> {
  const { error } = await db
    .from('job_matches')
    .update({ explanation: text ? { [locale]: text } : null, explained_at: now.toISOString() })
    .eq('id', matchId);
  if (error) throw error;
}
```
Примечание: в `ExplainJob.id` кладётся **id совпадения** (`m.id`): так ответ модели сразу сопоставляется со строкой `job_matches`.

- [ ] **Step 4: `explain.ts`**

`apps/jobs/src/pipeline/explain.ts`:
```ts
import { EXPLAIN_BATCH, explainMatches, LlmError, LlmRateLimitError } from '@jp/ai';
import type { Locale } from '@jp/core';
import {
  getAiRequestsToday,
  getExplainDetails,
  getMatchesToExplain,
  recordAiUsage,
  saveExplanation,
  type ExplainDetail,
} from './ai-repository';
import { type AiDeps, type AiStatus, isTransient, pacer } from './enrich';

export const EXPLAIN_PER_USER_DAILY = 20;
export const EXPLAIN_MIN_SCORE = 50;

export type ExplainDeps = AiDeps & { perUserLimit?: number; onlyUserIds?: string[] };
export type ExplainResult = { status: AiStatus; explained: number; requests: number; retryAfterMs: number | null };

type Batch = { locale: Locale; details: ExplainDetail[] };

/** Groups each user's picks by search profile (criteria differ) into chunks the model takes in one call. */
function batches(picks: { matchId: string; userId: string; locale: Locale }[], details: Map<string, ExplainDetail>): Batch[] {
  const groups = new Map<string, Batch>();
  for (const pick of picks) {
    const detail = details.get(pick.matchId);
    if (!detail) continue;
    const key = `${pick.userId}:${detail.profileId ?? '-'}`;
    const group = groups.get(key) ?? { locale: pick.locale, details: [] };
    group.details.push(detail);
    groups.set(key, group);
  }
  return [...groups.values()].flatMap((g) => {
    const out: Batch[] = [];
    for (let i = 0; i < g.details.length; i += EXPLAIN_BATCH) out.push({ locale: g.locale, details: g.details.slice(i, i + EXPLAIN_BATCH) });
    return out;
  });
}

export async function explainTopMatches(deps: ExplainDeps): Promise<ExplainResult> {
  const { db, llm } = deps;
  const result: ExplainResult = { status: 'ok', explained: 0, requests: 0, retryAfterMs: null };
  if (!llm.isAvailable('public')) return { ...result, status: 'unavailable' };

  const now = deps.now?.() ?? new Date();
  let budget = deps.dailyLimit - (await getAiRequestsToday(db, now, 'public'));
  if (budget <= 0) return { ...result, status: 'daily_limit' };

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const picks = await getMatchesToExplain(db, dayStart, deps.perUserLimit ?? EXPLAIN_PER_USER_DAILY, EXPLAIN_MIN_SCORE, deps.onlyUserIds);
  const details = new Map<string, ExplainDetail>();
  for (const locale of new Set(picks.map((p) => p.locale))) {
    const ids = picks.filter((p) => p.locale === locale).map((p) => p.matchId);
    for (const d of await getExplainDetails(db, ids, locale)) details.set(d.matchId, d);
  }

  const deadline = Date.now() + (deps.timeBudgetMs ?? 240_000);
  const pace = pacer(deps);
  for (const batch of batches(picks, details)) {
    const criteria = batch.details[0]!.criteria;
    if (!criteria) {
      // The search profile was deleted: nothing to explain against.
      for (const d of batch.details) await saveExplanation(db, d.matchId, batch.locale, null, now);
      continue;
    }
    if (budget <= 0) {
      result.status = 'daily_limit';
      break;
    }
    if (Date.now() > deadline) break;
    await pace();
    try {
      const res = await explainMatches(llm, { locale: batch.locale, criteria, jobs: batch.details.map((d) => d.job) });
      await recordAiUsage(db, now, 'public', res.model, res.usage);
      budget -= res.usage.requests;
      result.requests += res.usage.requests;
      for (const d of batch.details) {
        const text = res.explanations.get(d.matchId) ?? null;
        await saveExplanation(db, d.matchId, batch.locale, text, now);
        if (text) result.explained += 1;
      }
    } catch (err) {
      if (err instanceof LlmRateLimitError) {
        result.status = 'rate_limited';
        result.retryAfterMs = err.retryAfterMs;
        break;
      }
      if (err instanceof LlmError && isTransient(err)) {
        result.status = 'provider_error';
        break;
      }
      if (!(err instanceof LlmError)) throw err;
      // A deterministic failure (bad output, 4xx) would repeat every hour: mark the batch as done.
      for (const d of batch.details) await saveExplanation(db, d.matchId, batch.locale, null, now);
    }
  }
  return result;
}
```
В `getExplainDetails` убедиться, что `Seniority` и `SENIORITIES` импортированы из `@jp/core` (они уже есть в импорте для `getJobsToEnrich`).

- [ ] **Step 5: Расписание и CLI**

В `apps/jobs/src/trigger/enrich-jobs.ts` дописать:
```ts
import { explainTopMatches } from '../pipeline/explain';

export const explainMatchesTask = schedules.task({
  id: 'explain-matches',
  cron: '40 * * * *',
  queue: AI_PUBLIC_QUEUE,
  ttl: '30m',
  maxDuration: 300,
  retry: { maxAttempts: 1 },
  run: async () => {
    const result = await explainTopMatches(aiDeps());
    logger.info('explanations', result);
    return result;
  },
});
```

В `apps/jobs/src/cli/enrich-once.ts` дописать в конец:
```ts
const { explainTopMatches } = await import('../pipeline/explain');
const explained = await explainTopMatches({ ...deps, timeBudgetMs: Number.POSITIVE_INFINITY });
console.log(`explanations: ${JSON.stringify(explained)}`);
```

- [ ] **Step 6: Smoke-скрипт с живым ключом**

`apps/jobs/src/cli/ai-smoke.ts`:
```ts
// Manual check against the real provider. Never run in CI. Needs GEMINI_API_KEY_PUBLIC in apps/jobs/.env.
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const { createLlmClient, enrichJob, explainMatches, readAiEnv } = await import('@jp/ai');

const env = readAiEnv();
if (!env.GEMINI_API_KEY_PUBLIC) {
  console.error('Set GEMINI_API_KEY_PUBLIC in apps/jobs/.env (aistudio.google.com/apikey).');
  process.exit(1);
}
const llm = createLlmClient(env);
console.log(`model: ${llm.model('public')}`);

const sample = {
  title: 'Senior Frontend Developer (React)',
  company: 'Acme Payments',
  location: 'Remote — EU timezones',
  salaryRaw: '€4,500–5,500 per month',
  tags: ['react', 'typescript'],
  descriptionText:
    'Acme Payments builds checkout tools for online shops. You will own our React + TypeScript dashboard, work with a Node.js/PostgreSQL backend team, and ship weekly. We hire remotely within the EU and Ukraine. 5+ years with React required; Next.js and Storybook are a plus.',
};

let t = Date.now();
const enriched = await enrichJob(llm, sample);
console.log(JSON.stringify(enriched, null, 2), `\n${Date.now() - t} ms`);

t = Date.now();
const explained = await explainMatches(llm, {
  locale: 'uk',
  criteria: { keywords: ['frontend'], skills: ['React', 'TypeScript'], seniority: ['senior'], remoteType: 'remote', salaryMinUsd: 4000 },
  jobs: [
    {
      id: 'sample',
      title: sample.title,
      company: sample.company,
      summary: enriched.enrichment.summary.en ?? null,
      skills: enriched.enrichment.skills,
      matchedSkills: ['React', 'TypeScript'],
      seniority: enriched.enrichment.seniority,
      remoteType: enriched.enrichment.remoteType,
      location: sample.location,
      salaryMinUsd: enriched.enrichment.salaryMinUsd,
      salaryMaxUsd: enriched.enrichment.salaryMaxUsd,
    },
  ],
});
console.log(explained.explanations.get('sample'), `\n${Date.now() - t} ms`, explained.usage);
```
В `apps/jobs/package.json` → `scripts`: `"ai:smoke": "tsx src/cli/ai-smoke.ts"`.

- [ ] **Step 7: README** — в корневом `README.md`:
- в список пакетов добавить строку ``- `packages/ai` — provider-agnostic LLM client (Gemini) and AI tasks: job enrichment, "why it fits"``;
- после раздела «Running the pipeline once» добавить:
````markdown
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
````

- [ ] **Step 8: Прогнать тесты и typecheck**

Run: `pnpm --filter @jp/jobs typecheck && pnpm --filter @jp/jobs test:integration`
Expected: PASS — `explain.int.test.ts` (4) и все прежние.

- [ ] **Step 9: Commit**

```bash
git add apps/jobs README.md
git commit -m "feat(jobs): daily 'why it fits' explanations, AI schedules and smoke script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Веб — страна в профиле, AI-описание и «почему подходит» на `/today`, E2E

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/today/card-skills.ts`, `apps/web/src/app/[locale]/(app)/today/card-skills.test.ts`
- Modify: `packages/core/src/profile/profile-schema.ts`, `packages/core/src/profile/profile-schema.test.ts`, `apps/web/src/app/[locale]/(app)/profile/{page.tsx,profile-form.tsx,actions.ts}`, `apps/web/src/app/[locale]/(app)/today/{page.tsx,job-match-card.tsx}`, `apps/web/messages/{en,uk,ru}.json`, `apps/web/e2e/helpers/seed.ts`, `apps/web/e2e/today.spec.ts`, `apps/web/e2e/profile.spec.ts`, `docs/superpowers/plans/2026-10-01-roadmap.md`, `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md`

**Interfaces:**
- Consumes: `COUNTRY_CODES`, `isCountryCode`, `localized`, `isLocale`, `SENIORITIES`, `type Seniority` (`@jp/core`); колонки `profiles.country`, `jobs.summary/skills/seniority`, `job_matches.explanation/breakdown`.
- Produces: `profileUpdateSchema` + `country: string | null`; `cardSkills(jobSkills: string[], matched: string[], max?: number): { name: string; matched: boolean }[]`, `matchedSkillsOf(breakdown: unknown): string[]`; `JobMatchView` + `summary`, `why`, `seniority`, `skills`; test ids `match-summary`, `match-why`, `match-skill` (`data-matched`).

- [ ] **Step 1: Падающие тесты**

В `packages/core/src/profile/profile-schema.test.ts` добавить:
```ts
it('accepts a supported country or null', () => {
  const base = { full_name: 'A', timezone: 'Europe/Kyiv', contacts: {} };
  expect(profileUpdateSchema.safeParse({ ...base, country: 'UA' }).success).toBe(true);
  expect(profileUpdateSchema.safeParse({ ...base, country: null }).success).toBe(true);
  expect(profileUpdateSchema.safeParse({ ...base, country: 'XX' }).success).toBe(false);
});
```
(Если в файле нет импорта `profileUpdateSchema` — добавить. Существующие кейсы, которые парсят объект без `country`, дополнить `country: null`.)

`apps/web/src/app/[locale]/(app)/today/card-skills.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { cardSkills, matchedSkillsOf } from './card-skills';

describe('cardSkills', () => {
  it('puts matched skills first and caps the list', () => {
    expect(cardSkills(['Docker', 'React', 'Kafka', 'Go', 'AWS', 'SQL'], ['kafka', 'react'])).toEqual([
      { name: 'React', matched: true },
      { name: 'Kafka', matched: true },
      { name: 'Docker', matched: false },
      { name: 'Go', matched: false },
      { name: 'AWS', matched: false },
    ]);
  });
  it('falls back to matched skills when the job has no AI skills', () => {
    expect(cardSkills([], ['React'])).toEqual([{ name: 'React', matched: true }]);
  });
  it('reads matched skills from a stored breakdown defensively', () => {
    expect(matchedSkillsOf({ matchedSkills: ['React', 3] })).toEqual(['React']);
    expect(matchedSkillsOf({ matchedSkills: 'React' })).toEqual([]);
    expect(matchedSkillsOf(null)).toEqual([]);
  });
});
```

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/web test`
Expected: FAIL — нет `country` в схеме, нет `./card-skills`.

- [ ] **Step 2: Схема профиля и навыки карточки**

`packages/core/src/profile/profile-schema.ts`:
```ts
import { isCountryCode } from '../jobs/regions';
```
```ts
export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  timezone: z.string().refine(isValidTimeZone),
  contacts: contactsSchema,
  country: z.string().refine(isCountryCode).nullable(),
});
```

`apps/web/src/app/[locale]/(app)/today/card-skills.ts`:
```ts
/** Skills chips for a match card: the ones the user searched for first, at most `max`. */
export function cardSkills(jobSkills: string[], matched: string[], max = 5): { name: string; matched: boolean }[] {
  const wanted = new Set(matched.map((s) => s.toLowerCase()));
  const source = jobSkills.length > 0 ? jobSkills : matched;
  const chips = source.map((name) => ({ name, matched: wanted.has(name.toLowerCase()) }));
  return [...chips.filter((c) => c.matched), ...chips.filter((c) => !c.matched)].slice(0, max);
}

/** breakdown is jsonb written by the pipeline; read matchedSkills defensively. */
export function matchedSkillsOf(breakdown: unknown): string[] {
  const value = (breakdown as { matchedSkills?: unknown } | null)?.matchedSkills;
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];
}
```

- [ ] **Step 3: Профиль — страна проживания**

`actions.ts`: в `ProfileValues` добавить `country: string`; в `values` — `country: String(formData.get('country') ?? '')`; в `raw` — `country: values.country || null`; в `.update({...})` — `country: parsed.data.country`.

`page.tsx`:
```tsx
import { COUNTRY_CODES, contactsSchema } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
```
select: `.select('full_name, timezone, contacts, country')`. Перед `return`:
```tsx
  const locale = await getLocale();
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
  const countries = COUNTRY_CODES.map((code) => ({ code, name: regionNames.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );
```
и передать в форму `country={profile.country ?? ''}` и `countries={countries}`.

`profile-form.tsx`: в `Props` добавить `country: string; countries: { code: string; name: string }[]`, принять их в `ProfileForm`. В первый блок (`brutal grid ... md:grid-cols-2`) после `<datalist>` добавить:
```tsx
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="profile-country" className="font-mono text-xs uppercase">
            {t('country')}
          </label>
          <select
            id="profile-country"
            name="country"
            defaultValue={v?.country ?? country}
            aria-invalid={invalid.has('country')}
            aria-describedby="profile-country-hint"
            className={`brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand ${invalid.has('country') ? 'border-danger' : ''}`}
          >
            <option value="">{t('countryNone')}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p id="profile-country-hint" className="text-xs text-muted-foreground">
            {t('countryHint')}
          </p>
        </div>
```

- [ ] **Step 4: `/today` — описание, «почему подходит», навыки, грейд**

`page.tsx`:
```tsx
import { isLocale, type LocalizedText, localized, SENIORITIES, type Seniority } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { cardSkills, matchedSkillsOf } from './card-skills';
```
select:
```ts
      'id, score, created_at, breakdown, explanation, jobs!inner(title, location, remote_type, seniority, salary_min_usd, salary_max_usd, summary, skills, companies(name), job_postings(source_id, url))',
```
перед маппингом:
```ts
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
```
в маппинг добавить:
```ts
    summary: localized(m.jobs.summary as LocalizedText | null, locale) || null,
    why: localized(m.explanation as LocalizedText | null, locale) || null,
    seniority: (SENIORITIES as readonly string[]).includes(m.jobs.seniority ?? '') ? (m.jobs.seniority as Seniority) : null,
    skills: cardSkills(m.jobs.skills, matchedSkillsOf(m.breakdown)),
```

`job-match-card.tsx`: в `JobMatchView` добавить
```ts
  summary: string | null;
  why: string | null;
  seniority: 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null;
  skills: { name: string; matched: boolean }[];
```
После блока заголовка (перед строкой с `remote_...`) вставить:
```tsx
      {match.summary && (
        <p data-testid="match-summary" className="text-sm">
          {match.summary}
        </p>
      )}
      {match.why && (
        <p data-testid="match-why" className="border-l-4 border-brand pl-3 text-sm">
          <span className="font-semibold">{t('why')}: </span>
          {match.why}
        </p>
      )}
      {match.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {match.skills.map((s) => (
            <li
              key={s.name}
              data-testid="match-skill"
              data-matched={s.matched}
              className={`rounded-sm border-2 border-border px-1.5 py-0.5 font-mono text-xs ${s.matched ? 'bg-brand text-brand-foreground' : ''}`}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
```
В строку метаданных после `remote_...` добавить `{match.seniority && <span>{t(`seniority_${match.seniority}`)}</span>}`.

- [ ] **Step 5: Сообщения (все три локали, одинаковые ключи)**

`apps/web/messages/en.json`: в `profile` — `"country": "Country of residence"`, `"countryNone": "Not set"`, `"countryHint": "Remote jobs that only hire in other countries are hidden."`; в `today` — `"why": "Why it fits"`, `"seniority_intern": "Intern"`, `"seniority_junior": "Junior"`, `"seniority_middle": "Middle"`, `"seniority_senior": "Senior"`, `"seniority_lead": "Lead"`.

`uk.json`: `"country": "Країна проживання"`, `"countryNone": "Не вказано"`, `"countryHint": "Віддалені вакансії, які наймають лише в інших країнах, буде приховано."`; `"why": "Чому підходить"`, `"seniority_intern": "Стажер"`, `"seniority_junior": "Junior"`, `"seniority_middle": "Middle"`, `"seniority_senior": "Senior"`, `"seniority_lead": "Lead"`.

`ru.json`: `"country": "Страна проживания"`, `"countryNone": "Не указана"`, `"countryHint": "Удалённые вакансии, которые нанимают только в других странах, будут скрыты."`; `"why": "Почему подходит"`, `"seniority_intern": "Стажёр"`, `"seniority_junior": "Junior"`, `"seniority_middle": "Middle"`, `"seniority_senior": "Senior"`, `"seniority_lead": "Lead"`.

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck`
Expected: PASS, включая тест паритета сообщений.

- [ ] **Step 6: E2E**

`apps/web/e2e/helpers/seed.ts` — расширить `seedMatch`:
```ts
export async function seedMatch(
  email: string,
  opts: {
    title?: string;
    score?: number;
    status?: 'active' | 'expired';
    seniority?: 'intern' | 'junior' | 'middle' | 'senior' | 'lead';
    skills?: string[];
    summary?: Record<string, string>;
    explanation?: Record<string, string>;
    matchedSkills?: string[];
  } = {},
) {
```
в insert вакансии добавить `seniority: opts.seniority ?? null, skills: opts.skills ?? [], summary: opts.summary ?? null`; в insert совпадения — `explanation: opts.explanation ?? null, breakdown: { matchedSkills: opts.matchedSkills ?? [] }`.

`apps/web/e2e/today.spec.ts` — добавить:
```ts
test('shows the AI summary, why it fits and matched skills first', async ({ context, page }) => {
  const email = uniqueEmail('today-ai');
  await loginAs(context, email);
  const { title } = await seedMatch(email, {
    score: 91,
    seniority: 'senior',
    skills: ['Docker', 'React', 'Kafka'],
    matchedSkills: ['Kafka'],
    summary: { en: 'Fintech team building payments.', uk: 'Фінтех-команда будує платежі.' },
    explanation: { en: 'Kafka and the senior level match your search.' },
  });
  const card = page.getByTestId('job-match').filter({ hasText: title });

  await page.goto('/en/today');
  await expect(card.getByTestId('match-summary')).toHaveText('Fintech team building payments.');
  await expect(card.getByTestId('match-why')).toContainText('Kafka and the senior level match your search.');
  await expect(card.getByTestId('match-skill').first()).toHaveText('Kafka');
  await expect(card.getByTestId('match-skill').first()).toHaveAttribute('data-matched', 'true');
  await expect(card).toContainText('Senior');

  await page.goto('/uk/today');
  await expect(card.getByTestId('match-summary')).toHaveText('Фінтех-команда будує платежі.');
  await expect(card.getByTestId('match-why')).toContainText('Kafka and the senior level match your search.');
});
```

`apps/web/e2e/profile.spec.ts` — добавить:
```ts
test('saves the country of residence', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('Country of residence').selectOption('UA');
  await page.getByTestId('profile-save').click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Country of residence')).toHaveValue('UA');
});
```

Run: `E2E_PORT=3100 pnpm --filter @jp/web test:e2e`
Expected: PASS — прежние 38 + 2 новых. Порт 3000 занят другим приложением пользователя. Dev-сервер гасить только по своему PID.

- [ ] **Step 7: Документация**

`docs/superpowers/plans/2026-10-01-roadmap.md`: статус Плана 3 → `✅ PR #4`, Плана 4 → `✅ PR #5`, Плана 5 → `следующий`.

`docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md`, в конец раздела 12.2 добавить:
```markdown
- **Реализация (План 4):** обогащаются только вакансии с видимым совпадением, лучшие первыми; лимит `AI_DAILY_LIMIT` запросов/сутки, темп `AI_MIN_INTERVAL_MS`, 429 останавливает пачку. AI заполняет пробелы (грейд, формат, зарплата), но не перетирает данные источника. «Почему подходит» идёт через публичный ключ: в промпт попадают только вакансия и критерии профиля поиска (ключевые слова, навыки, грейд, формат, мин. зарплата), без имени, контактов, CV и страны. Роль хранится текстом `jobs.role` (справочник `roles` — позже). Гео-пригодность remote: `jobs.remote_regions` против `profiles.country`.
```

- [ ] **Step 8: Полный прогон и commit**

Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration`
Expected: всё PASS.

```bash
git add apps/web packages/core docs
git commit -m "feat(web): country of residence, AI summary and 'why it fits' on Today

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## После выполнения

1. Пользователь кладёт `GEMINI_API_KEY_PUBLIC` в `apps/jobs/.env` → `pnpm --filter @jp/jobs ai:smoke` (проверить модель по умолчанию; при 404 модели выставить `AI_MODEL_PUBLIC` на актуальную flash-lite из AI Studio) → `pnpm --filter @jp/jobs enrich-once --limit=10` → посмотреть `/today`.
2. PR #5 `feat/plan-4-ai` → база `feat/plan-3-sources`.
