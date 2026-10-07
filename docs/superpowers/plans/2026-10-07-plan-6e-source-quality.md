# План 6e — Якість джерел і канал рекомендацій: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Обробляти передусім джерела, що реально дають релевантні вакансії українським fullstack/frontend розробникам; вимкнути за замовчуванням малорезультативні; посилити Djinni; додати канал рекомендацій («Знайти людину в компанії») і підказку тримати профілі Djinni/LinkedIn активними.

**Architecture:** Каталог джерел отримує прапорець `lowYield`; `defaultSources` його виключає (джерело лишається доступним у «Де шукати» з позначкою). Djinni: розширена мапа категорій і до 4 категорій на профіль. Веб: посилання на пошук людей у LinkedIn для компанії вакансії, підказка в онбордингу.

**Tech Stack:** TypeScript 6.0.3, Next.js 16, next-intl, Vitest, Playwright.

**Spec:** рішення власника в чаті 2026-10-07 («обробляти самі дієві джерела, без мусору») + дані:
- наша БД за 30 днів, профіль власника, частка збігів зі скором ≥ 60: Work.ua 53%, robota.ua 44%, Djinni 24%, LinkedIn 18%, Working Nomads 20%, Himalayas 27%, HN 10%, DOU 6% (але найбільше в штуках — 131), Remotive 5%, Remote OK 13%; **Arbeitnow 1%, WWR 3%, Jobico 3%, Just Join IT 4%, Jobicy 5%**; OLX — 15 вакансій/30 днів на браузерній машині;
- DOU 2025: роботу знаходять через рекомендації, Djinni 28%, LinkedIn 24%, DOU 19%;
- перевірка Djinni 2026-10-07: валідні `primary_keyword` — `Fullstack`, `React.js`, `Node.js`, `JavaScript`, `Vue.js`, `Angular`; невалідні (`Front End`, `Frontend`, `TypeScript`, будь-що інше) мовчки повертають усі вакансії.

## Global Constraints

- Всі Global Constraints попередніх планів (TS 6.0.3, `@jp/`, Zod на межах, messages en/uk/ru з однаковими ключами, без нових залежностей, локальну БД не скидати, E2E на `E2E_PORT=3100`).
- `lowYield` за замовчуванням вимкнені: `arbeitnow`, `wwr`, `jobico`, `jobicy`, `justjoin`, `olx`. Вони лишаються доступними для ручного вибору.
- Djinni: лише валідні категорії з переліку вище; не більше **4** категорій на профіль.
- Посилання «Знайти людину» — лише відкривають публічний пошук LinkedIn у новій вкладці (`rel="noopener noreferrer"`), без скрапінгу людей.

---

### Task 1: core — `lowYield` і категорії Djinni

**Files:** Modify `packages/core/src/jobs/sources.ts`, `packages/core/src/jobs/sources.test.ts`, `packages/core/src/jobs/search.ts`, `packages/core/src/jobs/search.test.ts`

**Interfaces:**
- Produces: `SourceInfo.lowYield?: true`; `defaultSources()` виключає `lowYield`; `DJINNI_PRIMARY_KEYWORDS` доповнено; у `buildSourceQueries` Djinni бере до 4 категорій.

- [ ] **Step 1: Тести** — `sources.test.ts`:
```ts
  it('keeps low-yield boards out of the defaults but in the catalog', () => {
    const low = ['arbeitnow', 'wwr', 'jobico', 'jobicy', 'justjoin', 'olx'] as const;
    for (const id of low) {
      expect(sourceInfo(id)?.lowYield, id).toBe(true);
      expect(defaultSources('any'), id).not.toContain(id);
    }
    expect(defaultSources('any')).toEqual(expect.arrayContaining(['dou', 'djinni', 'workua', 'robotaua', 'remotive', 'himalayas']));
  });
```
`search.test.ts`:
```ts
describe('djinni categories', () => {
  it('maps full stack / frontend profiles to valid Djinni categories, max 4', () => {
    const specs = buildSourceQueries({ keywords: ['full stack', 'frontend'], skills: ['React', 'Node.js', 'TypeScript', 'Vue'], remoteType: 'any', sources: ['djinni'] });
    expect(specs.map((s) => s.params.primary_keyword)).toEqual(['Fullstack', 'JavaScript', 'React.js', 'Node.js']);
  });
  it('never emits an unknown category', () => {
    const valid = new Set(['Fullstack', 'React.js', 'Node.js', 'JavaScript', 'Vue.js', 'Angular', 'Python', 'Java', 'PHP', 'C# / .NET', 'Golang', 'Ruby', 'iOS', 'Android', 'Flutter', 'DevOps', 'QA', 'Project Manager', 'Product Manager', 'Design']);
    for (const v of Object.values(DJINNI_PRIMARY_KEYWORDS)) expect(valid.has(v), v).toBe(true);
  });
});
```
(Другий тест фіксує, що мапа не містить вигаданих категорій; якщо в мапі вже є значення поза цим списком (напр. `Sales`, `HR`), перевірити їх живим запитом `https://djinni.co/jobs/?primary_keyword=<v>` — валідна категорія повертає релевантні назви, невалідна — ті самі вакансії, що й `Bogus123`; невалідні прибрати з мапи, валідні додати до списку в тесті; результати перевірки — у звіт.)

- [ ] **Step 2: Реалізація**
- `sources.ts`: `lowYield?: true` у `SourceInfo` з коментарем `/** Rarely relevant for the target audience (measured share of good matches); off by default, still selectable. */`; позначити шість джерел; `defaultSources`: `.filter((s) => !s.beta && !s.lowYield && markets.includes(s.market))`.
- `search.ts`, `DJINNI_PRIMARY_KEYWORDS`: додати `'full stack': 'Fullstack'`, `fullstack: 'Fullstack'`, `'full-stack': 'Fullstack'`, `frontend: 'JavaScript'`, `'front end': 'JavaScript'`, `'front-end': 'JavaScript'`, `vue: 'Vue.js'`, `'vue.js': 'Vue.js'`, `nuxt: 'Vue.js'`, `angular: 'Angular'`; `.slice(0, 2)` → `.slice(0, 4)` з константою `MAX_DJINNI_CATEGORIES = 4`. Порядок — як зараз: спершу ключові слова профілю? — **звірити з тестом**: тест очікує `['Fullstack', 'JavaScript', 'React.js', 'Node.js']` для keywords `['full stack','frontend']` + skills `['React','Node.js',…]`; якщо поточний код бере `[...skills, ...keywords]`, змінити на `[...keywords, ...skills]` (ключові слова профілю важливіші).
- [ ] **Step 3:** `pnpm --filter @jp/core test && pnpm typecheck` → PASS (оновити старі тести, що очікували 2 категорії Djinni або lowYield-джерела в defaults).
- [ ] **Step 4: Commit** `feat(core): low-yield sources off by default; more valid Djinni categories`

---

### Task 2: Веб — позначка в «Де шукати», «Знайти людину в компанії», підказка про профілі

**Files:** Modify сторінку «Де шукати» (`apps/web/src/app/[locale]/(app)/search/…` — знайти компонент, що рендерить `source-<id>` чекбокси), `apps/web/src/components/apply-kit/apply-kit-panel.tsx` (або `contact-chips.tsx`), `apps/web/src/app/[locale]/(app)/today/match-detail.tsx`, онбординг (`apps/web/src/app/[locale]/(app)/onboarding/*` — фінальний крок), `apps/web/messages/{en,uk,ru}.json`; Create `apps/web/src/lib/people-search.ts` + `.test.ts`; E2E `search.spec.ts`, `apply-kit.spec.ts` або `feed.spec.ts`, `onboarding.spec.ts`.

**Interfaces:**
- Produces: `peopleSearchLinks(company: string): { recruiters: string; engineers: string }` — URL `https://www.linkedin.com/search/results/people/?keywords=<encodeURIComponent(company + ' recruiter')>` і `… + ' engineering manager'`; для порожньої/плейсхолдер-компанії компонент посилання не показує.

- [ ] **Step 1: Unit** `people-search.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { peopleSearchLinks } from './people-search';

describe('peopleSearchLinks', () => {
  it('builds LinkedIn people searches for the company', () => {
    expect(peopleSearchLinks('Acme & Co')).toEqual({
      recruiters: 'https://www.linkedin.com/search/results/people/?keywords=Acme%20%26%20Co%20recruiter',
      engineers: 'https://www.linkedin.com/search/results/people/?keywords=Acme%20%26%20Co%20engineering%20manager',
    });
  });
});
```
- [ ] **Step 2: Реалізація**
- `people-search.ts` — функція вище (trim компанії).
- «Де шукати»: біля чекбокса джерела з `sourceInfo(id)?.lowYield` — позначка `data-testid="low-yield-<id>"` з текстом `t('lowYield')`: en `"rarely relevant"`, uk `"рідко релевантне"`, ru `"редко релевантно"` (у namespace сторінки пошуку; так само, як існуюча позначка beta, якщо є).
- Apply kit і `match-detail`: блок «Знайти людину в компанії» (`data-testid="people-search"`) з двома посиланнями `people-recruiters` / `people-engineers`, `target="_blank" rel="noopener noreferrer"`; не показувати, якщо компанія порожня або `company_is_placeholder` (перевірити, чи це поле доступне в даних матчу; якщо ні — додати у вибірку). Тексти: заголовок en `"Find a person at the company"`, uk `"Знайти людину в компанії"`, ru `"Найти человека в компании"`; посилання en `"Recruiters"` / `"Engineering managers"`, uk `"Рекрутери"` / `"Інженерні менеджери"`, ru `"Рекрутеры"` / `"Инженерные менеджеры"`; підказка під ними en `"A referral is the #1 way people get hired: write a short note before or right after applying."`, uk `"Рекомендація — канал №1, через який наймають: напишіть коротке повідомлення до або одразу після відгуку."`, ru `"Рекомендация — канал №1, через который нанимают: напишите короткое сообщение до или сразу после отклика."`.
- Онбординг, фінальний крок: блок `data-testid="profiles-tip"`: en `"Recruiters search too: keep your Djinni profile active and LinkedIn set to “Open to work”."`, uk `"Рекрутери теж шукають: тримайте профіль на Djinni активним, а в LinkedIn — «Open to work»."`, ru `"Рекрутеры тоже ищут: держите профиль на Djinni активным, а в LinkedIn — «Open to work»."` + посилання `https://djinni.co/my/profile/` і `https://www.linkedin.com/in/` (нова вкладка).
- [ ] **Step 3: E2E** — `search.spec.ts`: у нового профілю `source-arbeitnow` не відмічений і має `low-yield-arbeitnow`; `source-djinni` відмічений. Тест вакансії (apply kit або match detail): `people-recruiters` має href з `linkedin.com/search/results/people/` і назвою компанії. `onboarding.spec.ts`: на фінальному кроці видно `profiles-tip`. Desktop + mobile.
- [ ] **Step 4:** `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
- [ ] **Step 5: Commit** `feat(web): flag rarely relevant sources, find-a-person links, keep-profiles-active tip`

---

### Task 3: Документація

- [ ] **Step 1:** Роадмап — рядок `| **6e. Якість джерел** | Малорезультативні джерела вимкнені за замовчуванням, більше категорій Djinni, «Знайти людину в компанії», підказка про профілі Djinni/LinkedIn | 12.1 | ✅ PR #12 |` після рядка 6d.
- [ ] **Step 2:** Спека 12.1 — рядок: «6e: джерела з часткою релевантних збігів < 5% (виміряно на даних власника, жовтень 2026) — Arbeitnow, WWR, Jobico, Jobicy, Just Join IT — і OLX (мало вакансій, дорогий браузер) вимкнені за замовчуванням, доступні вручну.»
- [ ] **Step 3:** `pnpm lint && pnpm typecheck && pnpm test` → PASS. Commit `docs: plan 6e status`.
