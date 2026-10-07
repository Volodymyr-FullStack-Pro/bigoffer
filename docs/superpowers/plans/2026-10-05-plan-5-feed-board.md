# План 5 — Лента «Сегодня» и умная доска: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить `/today` в рабочую ленту (десктоп — «почтовый клиент» с хоткеями, мобайл — колода со свайпами, отмена 5 с, фильтры, прогресс) и сделать `/board` — канбан откликов на dnd-kit со счётчиками, срочностью, умной сортировкой, панелью «Действия на сегодня», боковой панелью карточки, диалогом отказа и ручным добавлением карточки по ссылке.

**Architecture:** Чистая логика доски (ранги fractional-indexing, рабочие дни, срочность, умная сортировка, счётчики, «действия на сегодня», таксономия отказов) живёт в `@jp/core/board` и тестируется юнитами. БД получает `applications`, `application_labels`, `application_events` с RLS и SQL-функции `save_match_to_board`, `restore_match`, `move_application`, `reject_application` (security invoker — работают под RLS пользователя, атомарно пишут событие истории). Ранг считает TypeScript и передаёт в функции. Веб — серверные компоненты грузят данные, клиентские компоненты (motion для свайпов, dnd-kit для доски) делают оптимистичные обновления через server actions с откатом.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, next-intl, Tailwind v4 (токены «Neo-brutal Job Zine»), `motion` 13.4.6 (`motion/react`), `@dnd-kit/core` 6.3.1 + `@dnd-kit/sortable` 10.0.0 + `@dnd-kit/utilities` 3.2.2, `fractional-indexing` 4.0.0, Supabase (Postgres + RLS + pgTAP), Vitest 5, Playwright (проекты desktop и mobile).

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` — 5.6 (канбан), 7.1 п.2–5 (лента, доска), 7.3 (карточка — вкладки Обзор и История), 7.4 (диалог отказа, таксономия, правила follow-up), 7.8 (стиль, доступность), 12.3 (умная доска). Дорожная карта: `docs/superpowers/plans/2026-10-01-roadmap.md`.

## Global Constraints

- Все Global Constraints Планов 1–4: TS 6.0.3, scope `@jp/`, БД — revoke → grant → RLS, только новые миграции, Zod на границах, сообщения en/uk/ru с одинаковыми ключами (тест паритета), коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Версии новых зависимостей **точно**: `motion@13.4.6`, `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0`, `@dnd-kit/utilities@3.2.2`, `fractional-indexing@4.0.0`. Никаких `minimumReleaseAgeExclude`.
- `applications.rank` — `text collate "C"` (ключи fractional-indexing сравниваются побайтно).
- **Колонка ≠ лейбл ≠ итог** (spec 5.6). Перенос в колонку kind=`won` ставит `outcome='offer'`; в kind=`lost` — только через диалог отказа (`reject_application`); обратно в `active` — `outcome='open'` и очистка полей отказа. Перенос в колонку `applied` при пустом `applied_at` ставит `applied_at = now()`.
- **Срочность** (вычисляется, не хранится; spec 12.3 + 7.4): только для колонок kind=`active` с `outcome='open'`. `interview_soon` — `next_action_at` в ближайшие 48 ч; без `applied_at` — `none`; есть `first_response_at` — `fresh`; ≥ `ghost_after_days` календарных дней с отклика — `ghosting`; от последней активности (пинг) или отклика ≥ `follow_up_days[1]` рабочих дней — `overdue`, ≥ `follow_up_days[0]` — `ping`; иначе `fresh`. Значения по умолчанию `[5, 10]` и `21` берутся из `profiles`.
- **Умная сортировка**: `interview_soon` → `overdue` → `ghosting` → `ping` → `fresh` → `none`, внутри — по `rank`. По умолчанию «Умная» для `active`, «Вручную» для `won`/`lost`.
- Таксономия причин отказа — ровно 14 ключей spec 7.4; этапы — 6 значений `rejection_stage`.
- Каждое действие свайпа продублировано кнопкой; доска управляется с клавиатуры (dnd-kit KeyboardSensor + «Переместить в…» в панели карточки); `prefers-reduced-motion` отключает анимации (motion `useReducedMotion`).
- Хоткеи ленты (только десктоп, не в полях ввода, без модификаторов): `J`/`K` — следующая/предыдущая, `S` — сохранить, `H` — скрыть, `A` — откликнулся, `O` — открыть оригинал.
- Отмена (тост) — 5 секунд; оптимистичные изменения откатываются при ошибке с тостом ошибки.
- Ручная карточка по URL: сервер скачивает страницу **только** по http(s), порты 80/443, и **только** если все IP хоста публичные (проверка в `lookup` сокета — без TOCTOU), ≤ 3 редиректа, таймаут 8 с, ≤ 1.5 МБ. При неудаче — форма ручного ввода (spec 9).
- E2E проходят в обоих проектах Playwright (desktop, mobile); разметка обеих раскладок рендерится, невидимая скрыта CSS — в тестах используйте `.filter({ visible: true })`.

## Структура файлов

```
packages/core/src/board/
  rank.ts            rankBetween(), rankAtTop(), rankAtEnd()
  business-days.ts   businessDaysBetween()
  urgency.ts         URGENCIES, Urgency, applicationUrgency(), NEEDS_ACTION, smartSort(), columnCounters(), todayActions()
  rejection.ts       REJECTION_STAGES, REJECTION_REASONS, rejectionInputSchema, applicationPatchSchema
packages/core/src/index.ts  (+ экспорты)
supabase/migrations/20261008000100_applications_board.sql
supabase/tests/database/006_applications_board.test.sql
packages/db/src/database.types.ts   (регенерация)
apps/web/
  src/app/[locale]/(app)/today/   page.tsx, feed-types.ts, feed-filter.ts(+test), feed.tsx, feed-list-item.tsx, match-detail.tsx, swipe-card.tsx, actions.ts
  src/components/ui/toast.tsx, score-meter.tsx
  src/app/[locale]/(app)/board/   page.tsx, board-types.ts, board.tsx, board-column.tsx, board-card.tsx, today-actions.tsx, card-panel.tsx, reject-dialog.tsx, add-card-dialog.tsx, confetti.tsx, actions.ts
  src/lib/job-preview.ts(+test)
  messages/{en,uk,ru}.json  (feed.*, board.*)
  e2e/feed.spec.ts, e2e/board.spec.ts, e2e/helpers/seed.ts (seedApplication)
```

---

### Task 1: core — ранги, рабочие дни, срочность, умная сортировка, таксономия отказов

**Files:**
- Create: `packages/core/src/board/rank.ts`, `packages/core/src/board/business-days.ts`, `packages/core/src/board/urgency.ts`, `packages/core/src/board/rejection.ts`
- Modify: `packages/core/package.json` (dep), `packages/core/src/index.ts`
- Test: `packages/core/src/board/rank.test.ts`, `packages/core/src/board/business-days.test.ts`, `packages/core/src/board/urgency.test.ts`, `packages/core/src/board/rejection.test.ts`

**Interfaces:**
- Produces (`@jp/core`):
  - `rankBetween(prev: string | null, next: string | null): string`, `rankAtTop(first: string | null): string`, `rankAtEnd(last: string | null): string`.
  - `businessDaysBetween(from: Date, to: Date): number`.
  - `URGENCIES = ['interview_soon','overdue','ghosting','ping','fresh','none'] as const`, `type Urgency`; `type UrgencyInput = { columnKind: 'active'|'won'|'lost'; outcome: string; appliedAt: Date | null; firstResponseAt: Date | null; lastActivityAt: Date | null; nextActionAt: Date | null }`; `type FollowUpRules = { followUpDays: number[]; ghostAfterDays: number }`; `DEFAULT_FOLLOW_UP: FollowUpRules`; `applicationUrgency(a: UrgencyInput, now: Date, rules?: FollowUpRules): Urgency`; `NEEDS_ACTION: ReadonlySet<Urgency>`; `smartSort<T extends { rank: string; urgency: Urgency }>(cards: T[]): T[]`; `columnCounters(cards: { urgency: Urgency }[]): { total: number; needsAction: number }`; `type TodayAction = { id: string; kind: 'interview' | 'ping' | 'ghosting'; urgency: Urgency; at: Date | null }`; `todayActions(cards: { id: string; urgency: Urgency; nextActionAt: Date | null }[]): TodayAction[]`.
  - `REJECTION_STAGES`, `REJECTION_REASONS` (tuples), `type RejectionStage`, `type RejectionReason`, `rejectionInputSchema` (Zod: `{ stage, by: 'company'|'me', reasons: RejectionReason[] (1..14), note: string ≤ 2000 }`), `type RejectionInput`, `applicationPatchSchema` (Zod: `{ salary: string ≤120 | null, notes: string ≤5000 | null, nextActionAt: ISO datetime string | null, contactName: string ≤120 | null, contactUrl: http(s) URL | null }`), `type ApplicationPatch`.

- [ ] **Step 1: Зависимость**

В `packages/core/package.json` → `dependencies` добавить `"fractional-indexing": "4.0.0"`. Run: `pnpm install`.

- [ ] **Step 2: Падающие тесты**

`packages/core/src/board/rank.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rankAtEnd, rankAtTop, rankBetween } from './rank';

describe('rank', () => {
  it('orders keys byte-wise between neighbours', () => {
    const a = rankAtEnd(null);
    const b = rankAtEnd(a);
    const top = rankAtTop(a);
    const mid = rankBetween(a, b);
    expect([b, mid, top, a].sort()).toEqual([top, a, mid, b]);
  });
  it('rejects reversed neighbours', () => {
    expect(() => rankBetween('a1', 'a0')).toThrow();
  });
});
```

`packages/core/src/board/business-days.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { businessDaysBetween } from './business-days';

const d = (s: string) => new Date(`${s}T12:00:00Z`);

describe('businessDaysBetween', () => {
  it('counts weekdays after the start up to the end', () => {
    expect(businessDaysBetween(d('2026-09-28'), d('2026-10-05'))).toBe(5); // Mon → next Mon
    expect(businessDaysBetween(d('2026-10-02'), d('2026-10-05'))).toBe(1); // Fri → Mon
    expect(businessDaysBetween(d('2026-10-05'), d('2026-10-05'))).toBe(0);
    expect(businessDaysBetween(d('2026-10-05'), d('2026-10-02'))).toBe(0);
  });
});
```

`packages/core/src/board/urgency.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applicationUrgency, columnCounters, smartSort, todayActions, type UrgencyInput } from './urgency';

const now = new Date('2026-10-05T12:00:00Z'); // Monday
const at = (s: string) => new Date(s);
const base: UrgencyInput = {
  columnKind: 'active',
  outcome: 'open',
  appliedAt: null,
  firstResponseAt: null,
  lastActivityAt: null,
  nextActionAt: null,
};

describe('applicationUrgency', () => {
  it('is none outside active open cards and without an application date', () => {
    expect(applicationUrgency(base, now)).toBe('none');
    expect(applicationUrgency({ ...base, columnKind: 'lost', appliedAt: at('2026-09-01T10:00:00Z') }, now)).toBe('none');
    expect(applicationUrgency({ ...base, outcome: 'offer', appliedAt: at('2026-09-01T10:00:00Z') }, now)).toBe('none');
  });

  it('flags an interview within 48 hours first', () => {
    expect(
      applicationUrgency({ ...base, appliedAt: at('2026-09-01T10:00:00Z'), nextActionAt: at('2026-10-06T09:00:00Z') }, now),
    ).toBe('interview_soon');
    expect(applicationUrgency({ ...base, nextActionAt: at('2026-10-09T09:00:00Z') }, now)).toBe('none');
  });

  it('counts business days since applying', () => {
    expect(applicationUrgency({ ...base, appliedAt: at('2026-10-01T12:00:00Z') }, now)).toBe('fresh');
    expect(applicationUrgency({ ...base, appliedAt: at('2026-09-28T12:00:00Z') }, now)).toBe('ping');
    expect(applicationUrgency({ ...base, appliedAt: at('2026-09-21T12:00:00Z') }, now)).toBe('overdue');
    expect(applicationUrgency({ ...base, appliedAt: at('2026-09-14T12:00:00Z') }, now)).toBe('ghosting');
  });

  it('resets after a reply or a ping', () => {
    expect(
      applicationUrgency({ ...base, appliedAt: at('2026-09-21T12:00:00Z'), firstResponseAt: at('2026-09-22T12:00:00Z') }, now),
    ).toBe('fresh');
    expect(
      applicationUrgency({ ...base, appliedAt: at('2026-09-21T12:00:00Z'), lastActivityAt: at('2026-10-02T12:00:00Z') }, now),
    ).toBe('fresh');
  });

  it('honours custom follow-up rules', () => {
    const rules = { followUpDays: [2, 4], ghostAfterDays: 30 };
    expect(applicationUrgency({ ...base, appliedAt: at('2026-10-01T12:00:00Z') }, now, rules)).toBe('ping');
  });
});

describe('board helpers', () => {
  const cards = [
    { id: 'a', rank: 'a0', urgency: 'fresh' as const, nextActionAt: null },
    { id: 'b', rank: 'a1', urgency: 'ping' as const, nextActionAt: null },
    { id: 'c', rank: 'a2', urgency: 'interview_soon' as const, nextActionAt: at('2026-10-06T09:00:00Z') },
    { id: 'd', rank: 'Zz', urgency: 'ghosting' as const, nextActionAt: null },
    { id: 'e', rank: 'a3', urgency: 'ping' as const, nextActionAt: null },
  ];

  it('sorts urgent cards first, then by rank', () => {
    expect(smartSort(cards).map((c) => c.id)).toEqual(['c', 'd', 'b', 'e', 'a']);
  });

  it('counts cards that need action', () => {
    expect(columnCounters(cards)).toEqual({ total: 5, needsAction: 4 });
  });

  it('lists today actions: interviews, then pings, then ghosting', () => {
    expect(todayActions(cards).map((a) => [a.id, a.kind])).toEqual([
      ['c', 'interview'],
      ['b', 'ping'],
      ['e', 'ping'],
      ['d', 'ghosting'],
    ]);
  });
});
```

`packages/core/src/board/rejection.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applicationPatchSchema, REJECTION_REASONS, REJECTION_STAGES, rejectionInputSchema } from './rejection';

describe('rejection taxonomy', () => {
  it('has the spec keys', () => {
    expect(REJECTION_REASONS).toHaveLength(14);
    expect(REJECTION_STAGES).toEqual(['application', 'screening', 'technical', 'test_task', 'final', 'offer']);
  });
  it('validates a rejection', () => {
    expect(rejectionInputSchema.safeParse({ stage: 'technical', by: 'company', reasons: ['english'], note: '' }).success).toBe(true);
    expect(rejectionInputSchema.safeParse({ stage: 'technical', by: 'company', reasons: [], note: '' }).success).toBe(false);
    expect(rejectionInputSchema.safeParse({ stage: 'x', by: 'company', reasons: ['english'], note: '' }).success).toBe(false);
  });
  it('validates card edits', () => {
    const ok = { salary: '$4000', notes: 'n', nextActionAt: '2026-10-06T09:00:00.000Z', contactName: 'Anna', contactUrl: 'https://t.me/anna' };
    expect(applicationPatchSchema.safeParse(ok).success).toBe(true);
    expect(applicationPatchSchema.safeParse({ ...ok, contactUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(applicationPatchSchema.safeParse({ ...ok, nextActionAt: 'tomorrow' }).success).toBe(false);
  });
});
```

- [ ] **Step 3: Убедиться, что падают**

Run: `pnpm --filter @jp/core test`
Expected: FAIL — модулей `./rank`, `./business-days`, `./urgency`, `./rejection` нет.

- [ ] **Step 4: Реализация**

`packages/core/src/board/rank.ts`:
```ts
import { generateKeyBetween } from 'fractional-indexing';

/** A key strictly between two neighbours (null = open end). Compare keys byte-wise (Postgres: collate "C"). */
export function rankBetween(prev: string | null, next: string | null): string {
  return generateKeyBetween(prev, next);
}

export const rankAtTop = (first: string | null): string => rankBetween(null, first);
export const rankAtEnd = (last: string | null): string => rankBetween(last, null);
```

`packages/core/src/board/business-days.ts`:
```ts
const DAY = 24 * 60 * 60 * 1000;

/** Weekdays (Mon–Fri, UTC dates) after `from` up to and including `to`; 0 when `to` is not later. */
export function businessDaysBetween(from: Date, to: Date): number {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  let count = 0;
  for (let t = start + DAY; t <= end; t += DAY) {
    const weekday = new Date(t).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}
```

`packages/core/src/board/urgency.ts`:
```ts
import { businessDaysBetween } from './business-days';

export const URGENCIES = ['interview_soon', 'overdue', 'ghosting', 'ping', 'fresh', 'none'] as const;
export type Urgency = (typeof URGENCIES)[number];

export type UrgencyInput = {
  columnKind: 'active' | 'won' | 'lost';
  outcome: string;
  appliedAt: Date | null;
  firstResponseAt: Date | null;
  lastActivityAt: Date | null;
  nextActionAt: Date | null;
};

export type FollowUpRules = { followUpDays: number[]; ghostAfterDays: number };
export const DEFAULT_FOLLOW_UP: FollowUpRules = { followUpDays: [5, 10], ghostAfterDays: 21 };

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export function applicationUrgency(a: UrgencyInput, now: Date, rules: FollowUpRules = DEFAULT_FOLLOW_UP): Urgency {
  if (a.columnKind !== 'active' || a.outcome !== 'open') return 'none';
  if (a.nextActionAt) {
    const until = a.nextActionAt.getTime() - now.getTime();
    if (until >= 0 && until <= 48 * HOUR) return 'interview_soon';
  }
  if (!a.appliedAt) return 'none';
  if (a.firstResponseAt) return 'fresh';
  if ((now.getTime() - a.appliedAt.getTime()) / DAY >= rules.ghostAfterDays) return 'ghosting';
  // A ping (last_activity_at) restarts the follow-up timer.
  const since = a.lastActivityAt && a.lastActivityAt > a.appliedAt ? a.lastActivityAt : a.appliedAt;
  const days = businessDaysBetween(since, now);
  const [first = 5, second = 10] = rules.followUpDays;
  if (days >= second) return 'overdue';
  if (days >= first) return 'ping';
  return 'fresh';
}

export const NEEDS_ACTION: ReadonlySet<Urgency> = new Set(['interview_soon', 'overdue', 'ghosting', 'ping']);

const PRIORITY: Record<Urgency, number> = { interview_soon: 0, overdue: 1, ghosting: 2, ping: 3, fresh: 4, none: 5 };
const byRank = (a: { rank: string }, b: { rank: string }) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

export function smartSort<T extends { rank: string; urgency: Urgency }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => PRIORITY[a.urgency] - PRIORITY[b.urgency] || byRank(a, b));
}

export function columnCounters(cards: { urgency: Urgency }[]): { total: number; needsAction: number } {
  return { total: cards.length, needsAction: cards.filter((c) => NEEDS_ACTION.has(c.urgency)).length };
}

export type TodayAction = { id: string; kind: 'interview' | 'ping' | 'ghosting'; urgency: Urgency; at: Date | null };

export function todayActions(cards: { id: string; urgency: Urgency; nextActionAt: Date | null }[]): TodayAction[] {
  const interviews = cards
    .filter((c) => c.urgency === 'interview_soon')
    .sort((a, b) => (a.nextActionAt?.getTime() ?? 0) - (b.nextActionAt?.getTime() ?? 0))
    .map((c): TodayAction => ({ id: c.id, kind: 'interview', urgency: c.urgency, at: c.nextActionAt }));
  const pings = [...cards.filter((c) => c.urgency === 'overdue'), ...cards.filter((c) => c.urgency === 'ping')].map(
    (c): TodayAction => ({ id: c.id, kind: 'ping', urgency: c.urgency, at: null }),
  );
  const ghosts = cards
    .filter((c) => c.urgency === 'ghosting')
    .map((c): TodayAction => ({ id: c.id, kind: 'ghosting', urgency: c.urgency, at: null }));
  return [...interviews, ...pings, ...ghosts];
}
```

`packages/core/src/board/rejection.ts`:
```ts
import { z } from 'zod';

export const REJECTION_STAGES = ['application', 'screening', 'technical', 'test_task', 'final', 'offer'] as const;
export type RejectionStage = (typeof REJECTION_STAGES)[number];

export const REJECTION_REASONS = [
  'experience_level',
  'stack_mismatch',
  'english',
  'salary_expectations',
  'position_closed',
  'other_candidate',
  'test_task_failed',
  'tech_interview_failed',
  'location_timezone',
  'culture_fit',
  'no_feedback',
  'my_decision_salary',
  'my_decision_company',
  'other',
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export const rejectionInputSchema = z.object({
  stage: z.enum(REJECTION_STAGES),
  by: z.enum(['company', 'me']),
  reasons: z.array(z.enum(REJECTION_REASONS)).min(1).max(REJECTION_REASONS.length),
  note: z.string().trim().max(2000),
});
export type RejectionInput = z.infer<typeof rejectionInputSchema>;

const optionalText = (max: number) => z.string().trim().max(max).nullable();

export const applicationPatchSchema = z.object({
  salary: optionalText(120),
  notes: optionalText(5000),
  nextActionAt: z.iso.datetime().nullable(),
  contactName: optionalText(120),
  contactUrl: z.url({ protocol: /^https?$/ }).nullable(),
});
export type ApplicationPatch = z.infer<typeof applicationPatchSchema>;
```

В `packages/core/src/index.ts` добавить:
```ts
export * from './board/rank';
export * from './board/business-days';
export * from './board/urgency';
export * from './board/rejection';
```

- [ ] **Step 5: Тесты и typecheck**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): board ranks, business days, urgency, smart sort and rejection taxonomy

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: БД — отклики, лейблы карточек, история, функции ленты и доски

**Files:**
- Create: `supabase/migrations/20261008000100_applications_board.sql`, `supabase/tests/database/006_applications_board.test.sql`
- Modify: `packages/db/src/database.types.ts` (регенерация)

**Interfaces:**
- Produces (SQL, все `security invoker`, execute — `authenticated` и `service_role`):
  - `applications` (колонки ниже), `application_labels(application_id, label_id)`, `application_events(id, application_id, user_id, type, payload, created_at)`.
  - `save_match_to_board(p_match_id uuid, p_column_key text, p_rank text) returns table(application_id uuid, created boolean)`.
  - `restore_match(p_match_id uuid, p_application_id uuid default null) returns void`.
  - `move_application(p_id uuid, p_column_id uuid, p_rank text) returns void`.
  - `reject_application(p_id uuid, p_column_id uuid, p_rank text, p_stage text, p_by text, p_reasons text[], p_note text) returns void`.

- [ ] **Step 1: Падающий pgTAP-тест**

`supabase/tests/database/006_applications_board.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('a5000000-0000-0000-0000-00000000000a', 'board-a@test.dev'),
  ('a5000000-0000-0000-0000-00000000000b', 'board-b@test.dev');
insert into public.companies (id, name, normalized_name)
  values ('c5000000-0000-0000-0000-000000000001', 'Board Co', 'board co plan5 test');
insert into public.jobs (id, fingerprint, title, company_id)
  values ('d5000000-0000-0000-0000-000000000001', 'p5-1', 'Full Stack Dev', 'c5000000-0000-0000-0000-000000000001');
insert into public.job_postings (job_id, source_id, external_id, url)
  values ('d5000000-0000-0000-0000-000000000001', 'dou', 'p5-1', 'https://jobs.dou.ua/vacancies/p5-1/');
insert into public.job_matches (id, user_id, job_id, score)
  values ('e5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'd5000000-0000-0000-0000-000000000001', 88);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select results_eq(
  $$ select created from public.save_match_to_board('e5000000-0000-0000-0000-000000000001', 'saved', 'a0') $$,
  $$ values (true) $$, 'saving a match creates an application');
select is((select state from public.job_matches where id = 'e5000000-0000-0000-0000-000000000001'), 'saved', 'match state becomes saved');
select results_eq(
  $$ select a.title, a.company, a.url, a.source_id, c.key from public.applications a join public.board_columns c on c.id = a.column_id $$,
  $$ values ('Full Stack Dev'::text, 'Board Co'::text, 'https://jobs.dou.ua/vacancies/p5-1/'::text, 'dou'::text, 'saved'::text) $$,
  'snapshot of the job in the Saved column');
select results_eq(
  $$ select created from public.save_match_to_board('e5000000-0000-0000-0000-000000000001', 'applied', 'a1') $$,
  $$ values (false) $$, 'saving again reuses the application');
select is((select count(*)::int from public.application_events where type = 'created'), 1, 'one created event');

select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'applied'), 'a2');
select isnt((select applied_at from public.applications), null, 'moving to Applied stamps applied_at');
select is((select count(*)::int from public.application_events where type = 'moved'), 1, 'move is recorded');

select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'offer'), 'a3');
select is((select outcome from public.applications), 'offer', 'won column sets outcome offer');

select throws_ok(
  $$ select public.move_application((select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a4') $$,
  'P0001', null, 'lost column needs reject_application');
select public.reject_application(
  (select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a4',
  'technical', 'company', array['english', 'stack_mismatch'], 'weak English');
select results_eq(
  $$ select outcome, rejection_stage, rejection_by, rejection_reasons from public.applications $$,
  $$ values ('rejected'::text, 'technical'::text, 'company'::text, array['english', 'stack_mismatch']::text[]) $$,
  'rejection is stored');
select throws_ok(
  $$ select public.reject_application((select id from public.applications), (select id from public.board_columns where key = 'rejected'), 'a5', 'technical', 'company', array['nope'], '') $$,
  '23514', null, 'unknown rejection reason is refused');

select public.move_application(
  (select id from public.applications), (select id from public.board_columns where key = 'interview'), 'a6');
select results_eq(
  $$ select outcome, rejection_stage, rejection_reasons from public.applications $$,
  $$ values ('open'::text, null::text, '{}'::text[]) $$,
  'moving back to an active column reopens the card');

select public.restore_match('e5000000-0000-0000-0000-000000000001', (select id from public.applications));
select is((select count(*)::int from public.applications), 0, 'restore deletes the created application');
select is((select state from public.job_matches where id = 'e5000000-0000-0000-0000-000000000001'), 'new', 'restore returns the match to the feed');

-- Remember one of A's columns while still acting as A (B cannot see it under RLS).
select set_config('test.col_a', (select id::text from public.board_columns where key = 'saved'), true);
set local request.jwt.claims = '{"sub":"a5000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select throws_ok(
  $$ insert into public.applications (user_id, column_id, rank, title)
     values ('a5000000-0000-0000-0000-00000000000b', current_setting('test.col_a')::uuid, 'a0', 'x') $$,
  'P0001', null, 'a card cannot use another user''s column');
select throws_ok(
  $$ select public.save_match_to_board('e5000000-0000-0000-0000-000000000001', 'saved', 'a0') $$,
  'P0002', null, 'another user''s match is not found');

select * from finish();
rollback;
```

- [ ] **Step 2: Убедиться, что падает**

Run: `supabase test db`
Expected: FAIL в `006_applications_board.test.sql` — функции `save_match_to_board` нет.

- [ ] **Step 3: Миграция**

`supabase/migrations/20261008000100_applications_board.sql`:
```sql
-- Plan 5: application board (spec 5.6), feed → board actions, card history.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid references public.jobs (id) on delete set null,
  column_id uuid not null references public.board_columns (id) on delete restrict,
  rank text collate "C" not null,
  title text not null check (char_length(title) between 1 and 300),
  company text not null default '' check (char_length(company) <= 200),
  url text check (url is null or url ~ '^https?://'),
  location text check (char_length(location) <= 200),
  source_id text references public.sources (id),
  salary text check (char_length(salary) <= 120),
  notes text check (char_length(notes) <= 5000),
  contact jsonb not null default '{}',
  applied_at timestamptz,
  next_action_at timestamptz,
  first_response_at timestamptz,
  last_activity_at timestamptz,
  follow_up_count smallint not null default 0,
  outcome text not null default 'open' check (outcome in ('open', 'offer', 'rejected', 'withdrawn', 'ghosted')),
  rejection_stage text check (rejection_stage in ('application', 'screening', 'technical', 'test_task', 'final', 'offer')),
  rejection_by text check (rejection_by in ('company', 'me')),
  rejection_reasons text[] not null default '{}' check (rejection_reasons <@ array[
    'experience_level', 'stack_mismatch', 'english', 'salary_expectations', 'position_closed', 'other_candidate',
    'test_task_failed', 'tech_interview_failed', 'location_timezone', 'culture_fit', 'no_feedback',
    'my_decision_salary', 'my_decision_company', 'other']::text[]),
  rejection_note text check (char_length(rejection_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index applications_user_job on public.applications (user_id, job_id) where job_id is not null;
create index applications_board on public.applications (user_id, column_id, rank);
create trigger applications_updated_at before update on public.applications
  for each row execute function public.set_updated_at();

-- A card may only sit in a column of its owner. Invoker rights: under RLS a user only sees own columns.
create or replace function public.applications_check_column()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.board_columns c where c.id = new.column_id and c.user_id = new.user_id) then
    raise exception 'column does not belong to the card owner' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger applications_column_owner before insert or update of column_id, user_id on public.applications
  for each row execute function public.applications_check_column();

create table public.application_labels (
  application_id uuid not null references public.applications (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  primary key (application_id, label_id)
);

create table public.application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('created', 'moved', 'note', 'label', 'follow_up_sent', 'response', 'outcome')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index application_events_app on public.application_events (application_id, created_at desc);

-- grants
revoke all on public.applications, public.application_labels, public.application_events from anon, authenticated;
grant select, insert, delete on public.applications to authenticated;
grant update (column_id, rank, title, company, url, location, salary, notes, contact, applied_at, next_action_at,
              first_response_at, last_activity_at, follow_up_count, outcome, rejection_stage, rejection_by,
              rejection_reasons, rejection_note)
  on public.applications to authenticated;
grant select, insert, delete on public.application_labels to authenticated;
grant select, insert on public.application_events to authenticated;

-- RLS
alter table public.applications enable row level security;
alter table public.application_labels enable row level security;
alter table public.application_events enable row level security;

create policy "own applications" on public.applications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own application labels" on public.application_labels for all to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
    and exists (select 1 from public.labels l where l.id = label_id and l.user_id = (select auth.uid()))
  );
create policy "own application events select" on public.application_events for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own application events insert" on public.application_events for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );

-- Feed → board: snapshot the job into a column and take the match out of the feed. Re-saving reuses the card.
create or replace function public.save_match_to_board(p_match_id uuid, p_column_key text, p_rank text)
returns table (application_id uuid, created boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_job uuid;
  v_col uuid;
  v_app uuid;
begin
  select m.job_id into v_job from public.job_matches m where m.id = p_match_id and m.user_id = v_uid;
  if v_job is null then raise exception 'match not found' using errcode = 'P0002'; end if;
  select c.id into v_col from public.board_columns c where c.user_id = v_uid and c.key = p_column_key;
  if v_col is null then raise exception 'column not found' using errcode = 'P0002'; end if;

  update public.job_matches set state = 'saved' where id = p_match_id;

  select a.id into v_app from public.applications a where a.user_id = v_uid and a.job_id = v_job;
  if v_app is not null then
    return query select v_app, false;
    return;
  end if;

  insert into public.applications (user_id, job_id, column_id, rank, title, company, url, location, source_id, salary, applied_at)
  select v_uid, j.id, v_col, p_rank, left(j.title, 300), left(coalesce(co.name, ''), 200), p.url, left(j.location, 200),
         p.source_id, left(j.salary_raw, 120), case when p_column_key = 'applied' then now() end
  from public.jobs j
  left join public.companies co on co.id = j.company_id
  left join lateral (
    select jp.url, jp.source_id from public.job_postings jp where jp.job_id = j.id order by jp.seen_at desc limit 1
  ) p on true
  where j.id = v_job
  returning id into v_app;

  insert into public.application_events (application_id, user_id, type, payload)
  values (v_app, v_uid, 'created', jsonb_build_object('from', 'feed', 'column', p_column_key));
  return query select v_app, true;
end $$;

-- Undo of a feed action: put the match back and drop the card the action created (if any).
create or replace function public.restore_match(p_match_id uuid, p_application_id uuid default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.job_matches set state = 'new' where id = p_match_id and user_id = (select auth.uid());
  if p_application_id is not null then
    delete from public.applications
    where id = p_application_id and user_id = (select auth.uid())
      and job_id = (select m.job_id from public.job_matches m where m.id = p_match_id);
  end if;
end $$;

create or replace function public.move_application(p_id uuid, p_column_id uuid, p_rank text)
returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_from uuid;
  v_kind text;
  v_key text;
begin
  select a.column_id into v_from from public.applications a where a.id = p_id and a.user_id = v_uid;
  if v_from is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  select c.kind, c.key into v_kind, v_key from public.board_columns c where c.id = p_column_id and c.user_id = v_uid;
  if v_kind is null then raise exception 'column not found' using errcode = 'P0002'; end if;
  if v_kind = 'lost' and v_from <> p_column_id then
    raise exception 'use reject_application to move a card to a lost column' using errcode = 'P0001';
  end if;

  update public.applications a set
    column_id = p_column_id,
    rank = p_rank,
    applied_at = case when v_key = 'applied' and a.applied_at is null then now() else a.applied_at end,
    outcome = case when v_kind = 'won' then 'offer' when v_kind = 'active' then 'open' else a.outcome end,
    rejection_stage = case when v_kind = 'active' then null else a.rejection_stage end,
    rejection_by = case when v_kind = 'active' then null else a.rejection_by end,
    rejection_reasons = case when v_kind = 'active' then '{}' else a.rejection_reasons end,
    rejection_note = case when v_kind = 'active' then null else a.rejection_note end
  where a.id = p_id;

  if v_from <> p_column_id then
    insert into public.application_events (application_id, user_id, type, payload)
    values (p_id, v_uid, 'moved', jsonb_build_object('from', v_from, 'to', p_column_id));
  end if;
end $$;

create or replace function public.reject_application(
  p_id uuid, p_column_id uuid, p_rank text, p_stage text, p_by text, p_reasons text[], p_note text
) returns void language plpgsql security invoker set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_from uuid;
begin
  select a.column_id into v_from from public.applications a where a.id = p_id and a.user_id = v_uid;
  if v_from is null then raise exception 'application not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.board_columns c where c.id = p_column_id and c.user_id = v_uid and c.kind = 'lost') then
    raise exception 'not a lost column' using errcode = 'P0001';
  end if;
  update public.applications set
    column_id = p_column_id, rank = p_rank, outcome = 'rejected',
    rejection_stage = p_stage, rejection_by = p_by, rejection_reasons = p_reasons, rejection_note = nullif(p_note, '')
  where id = p_id;
  insert into public.application_events (application_id, user_id, type, payload)
  values (p_id, v_uid, 'outcome', jsonb_build_object('outcome', 'rejected', 'stage', p_stage, 'reasons', p_reasons));
end $$;

revoke execute on function public.save_match_to_board(uuid, text, text) from public, anon;
revoke execute on function public.restore_match(uuid, uuid) from public, anon;
revoke execute on function public.move_application(uuid, uuid, text) from public, anon;
revoke execute on function public.reject_application(uuid, uuid, text, text, text, text[], text) from public, anon;
revoke execute on function public.applications_check_column() from public, anon, authenticated;
grant execute on function public.save_match_to_board(uuid, text, text) to authenticated, service_role;
grant execute on function public.restore_match(uuid, uuid) to authenticated, service_role;
grant execute on function public.move_application(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.reject_application(uuid, uuid, text, text, text, text[], text) to authenticated, service_role;
```

Примечание к триггеру: функция триггера вызывается от имени пользователя, делающего insert/update, поэтому `revoke execute` у `authenticated` не мешает — триггеры не проверяют EXECUTE. Если pgTAP покажет обратное, вместо revoke оставьте `grant execute ... to authenticated` и зафиксируйте это в отчёте.

- [ ] **Step 4: Применить, pgTAP, типы**

Run: `supabase migration up --local && supabase test db`
Expected: PASS, все файлы (006 — 16 тестов). **Не выполнять `pnpm db:reset`** (локальные данные пользователя).

Run: `pnpm db:types && pnpm typecheck`
Expected: типы содержат `applications`, `application_labels`, `application_events` и 4 функции; typecheck PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase packages/db
git commit -m "feat(db): applications board with labels, history and feed/board functions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Лента «Сегодня» — почтовый клиент, колода со свайпами, отмена, фильтры

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/today/{feed-types.ts,feed-filter.ts,feed-filter.test.ts,feed.tsx,feed-list-item.tsx,match-detail.tsx,swipe-card.tsx}`, `apps/web/src/components/ui/toast.tsx`, `apps/web/src/components/ui/score-meter.tsx`, `apps/web/e2e/feed.spec.ts`
- Modify: `apps/web/package.json` (motion), `apps/web/src/app/[locale]/(app)/today/{page.tsx,actions.ts}`, `apps/web/messages/{en,uk,ru}.json`, `apps/web/e2e/today.spec.ts`, `apps/web/e2e/helpers/seed.ts`
- Delete: `apps/web/src/app/[locale]/(app)/today/job-match-card.tsx` (заменён)

**Interfaces:**
- Consumes: `rankAtTop` (`@jp/core`); `cardSkills`, `matchedSkillsOf` (`./card-skills`, План 4); RPC `save_match_to_board`, `restore_match` (Task 2).
- Produces:
  - `type FeedMatch` (ниже), `type FeedFilters = { profileId: string; minScore: number; remote: 'any' | 'remote' | 'hybrid' | 'office'; source: string }`, `DEFAULT_FILTERS`, `filterMatches(items: FeedMatch[], f: FeedFilters): FeedMatch[]`.
  - Server actions `saveMatch(matchId: string, target: 'saved' | 'applied'): Promise<{ ok: true; applicationId: string; created: boolean } | { ok: false }>`, `hideMatch(matchId: string): Promise<boolean>`, `restoreMatch(matchId: string, applicationId: string | null): Promise<boolean>`.
  - UI: `Toast`/`useToast` (`components/ui/toast.tsx`), `ScoreMeter` (`components/ui/score-meter.tsx`).
  - Test ids: `feed`, `feed-progress`, `feed-empty`, `job-match` (элемент списка/карточки, `data-match-id`), `match-score`, `match-summary`, `match-why`, `match-skill` (`data-matched`), `match-detail`, `match-save`, `match-applied`, `match-hide`, `match-open`, `toast`, `toast-undo`, `filter-min-score`, `filter-remote`, `filter-source`, `filter-profile`.

- [ ] **Step 1: Зависимость**

В `apps/web/package.json` → `dependencies`: `"motion": "13.4.6"`. Run: `pnpm install`.

- [ ] **Step 2: Падающий тест фильтра**

`apps/web/src/app/[locale]/(app)/today/feed-filter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS, filterMatches } from './feed-filter';
import type { FeedMatch } from './feed-types';

const m = (id: string, over: Partial<FeedMatch> = {}): FeedMatch => ({
  id,
  score: 80,
  title: id,
  company: 'Acme',
  location: null,
  remoteType: 'remote',
  seniority: null,
  salaryMinUsd: null,
  salaryMaxUsd: null,
  summary: null,
  why: null,
  description: '',
  skills: [],
  missingSkills: [],
  breakdown: null,
  profileId: 'p1',
  createdAt: '2026-10-05T10:00:00.000Z',
  postings: [{ sourceId: 'dou', url: 'https://jobs.dou.ua/v/1' }],
  ...over,
});

describe('filterMatches', () => {
  const items = [
    m('a'),
    m('b', { score: 40 }),
    m('c', { remoteType: 'office' }),
    m('d', { postings: [{ sourceId: 'djinni', url: 'https://djinni.co/j/1' }] }),
    m('e', { profileId: 'p2' }),
  ];
  it('keeps everything with default filters', () => {
    expect(filterMatches(items, DEFAULT_FILTERS)).toHaveLength(5);
  });
  it('filters by score, format, source and profile', () => {
    expect(filterMatches(items, { ...DEFAULT_FILTERS, minScore: 50 }).map((x) => x.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(filterMatches(items, { ...DEFAULT_FILTERS, remote: 'office' }).map((x) => x.id)).toEqual(['c']);
    expect(filterMatches(items, { ...DEFAULT_FILTERS, source: 'djinni' }).map((x) => x.id)).toEqual(['d']);
    expect(filterMatches(items, { ...DEFAULT_FILTERS, profileId: 'p2' }).map((x) => x.id)).toEqual(['e']);
  });
});
```
Run: `pnpm --filter @jp/web test` → FAIL (нет модулей).

- [ ] **Step 3: Типы и фильтр**

`today/feed-types.ts`:
```ts
export type RemoteType = 'remote' | 'hybrid' | 'office' | 'unknown';

export type FeedMatch = {
  id: string;
  score: number;
  title: string;
  company: string;
  location: string | null;
  remoteType: RemoteType;
  seniority: 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null;
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  summary: string | null;
  why: string | null;
  description: string;
  skills: { name: string; matched: boolean }[];
  /** Profile skills the job does not mention (shown as ✗ in details). */
  missingSkills: string[];
  breakdown: { skills: number; role: number; seniority: number; location: number; salary: number } | null;
  profileId: string | null;
  createdAt: string;
  postings: { sourceId: string; url: string }[];
};
```

`today/feed-filter.ts`:
```ts
import type { FeedMatch } from './feed-types';

export type FeedFilters = {
  profileId: string;
  minScore: number;
  remote: 'any' | 'remote' | 'hybrid' | 'office';
  source: string;
};

export const DEFAULT_FILTERS: FeedFilters = { profileId: 'all', minScore: 0, remote: 'any', source: 'all' };

export function filterMatches(items: FeedMatch[], f: FeedFilters): FeedMatch[] {
  return items.filter(
    (m) =>
      m.score >= f.minScore &&
      (f.remote === 'any' || m.remoteType === f.remote) &&
      (f.source === 'all' || m.postings.some((p) => p.sourceId === f.source)) &&
      (f.profileId === 'all' || m.profileId === f.profileId),
  );
}
```

- [ ] **Step 4: Server actions**

`today/actions.ts` (полностью заменить):
```ts
'use server';

import { rankAtTop } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SaveResult = { ok: true; applicationId: string; created: boolean } | { ok: false };

export async function saveMatch(matchId: string, target: 'saved' | 'applied'): Promise<SaveResult> {
  if (!UUID.test(matchId) || (target !== 'saved' && target !== 'applied') || !(await getUserId())) return { ok: false };
  const supabase = await createClient();
  const { data: column } = await supabase.from('board_columns').select('id').eq('key', target).maybeSingle();
  if (!column) return { ok: false };
  const { data: first } = await supabase
    .from('applications')
    .select('rank')
    .eq('column_id', column.id)
    .order('rank')
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase.rpc('save_match_to_board', {
    p_match_id: matchId,
    p_column_key: target,
    p_rank: rankAtTop(first?.rank ?? null),
  });
  const row = data?.[0];
  if (error || !row) {
    if (error) console.error('saveMatch failed', error.message);
    return { ok: false };
  }
  revalidatePath('/[locale]/board', 'page');
  return { ok: true, applicationId: row.application_id, created: row.created };
}

export async function hideMatch(matchId: string): Promise<boolean> {
  if (!UUID.test(matchId) || !(await getUserId())) return false;
  const supabase = await createClient();
  const { error } = await supabase.from('job_matches').update({ state: 'hidden' }).eq('id', matchId);
  if (error) console.error('hideMatch failed', error.message);
  return !error;
}

export async function restoreMatch(matchId: string, applicationId: string | null): Promise<boolean> {
  if (!UUID.test(matchId) || (applicationId !== null && !UUID.test(applicationId)) || !(await getUserId())) return false;
  const supabase = await createClient();
  const { error } = await supabase.rpc('restore_match', {
    p_match_id: matchId,
    ...(applicationId ? { p_application_id: applicationId } : {}),
  });
  if (error) console.error('restoreMatch failed', error.message);
  revalidatePath('/[locale]/board', 'page');
  return !error;
}
```

- [ ] **Step 5: UI-примитивы**

`components/ui/toast.tsx`:
```tsx
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ToastState = { message: string; tone?: 'info' | 'error'; undoLabel?: string; onUndo?: () => void } | null;

/** One toast at a time; it closes itself after `ms` (5 s by default). */
export function useToast(ms = 5000) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (next: NonNullable<ToastState>) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      timer.current = setTimeout(() => setToast(null), ms);
    },
    [ms],
  );
  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { toast, show, close };
}

export function Toast({ toast, onClose }: { toast: ToastState; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div
      role="status"
      data-testid="toast"
      className={`brutal fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 px-4 py-3 md:bottom-8 ${
        toast.tone === 'error' ? 'bg-danger text-white' : ''
      }`}
    >
      <span>{toast.message}</span>
      {toast.onUndo && (
        <button
          type="button"
          data-testid="toast-undo"
          className="font-mono text-sm font-bold uppercase underline"
          onClick={() => {
            toast.onUndo?.();
            onClose();
          }}
        >
          {toast.undoLabel}
        </button>
      )}
    </div>
  );
}
```

`components/ui/score-meter.tsx` (VU-метр, spec 7.8):
```tsx
/** Segmented match meter (10 segments) with the numeric score; the label is spoken, segments are decorative. */
export function ScoreMeter({ score, label }: { score: number; label: string }) {
  const lit = Math.round(score / 10);
  return (
    <span data-testid="match-score" className="inline-flex items-center gap-2 font-mono text-sm font-bold" aria-label={`${score}% ${label}`}>
      <span aria-hidden className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`h-3 w-1.5 border border-border ${i < lit ? (score >= 80 ? 'bg-brand' : score >= 60 ? 'bg-warning' : 'bg-muted-foreground') : 'bg-transparent'}`}
          />
        ))}
      </span>
      {score}% {label}
    </span>
  );
}
```

- [ ] **Step 6: Элемент списка, детали, свайп-карточка**

`today/feed-list-item.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { ScoreMeter } from '@/components/ui/score-meter';
import type { FeedMatch } from './feed-types';

export function FeedListItem({ match, selected, onSelect }: { match: FeedMatch; selected: boolean; onSelect: () => void }) {
  const t = useTranslations('today');
  return (
    <button
      type="button"
      data-testid="job-match"
      data-match-id={match.id}
      aria-current={selected}
      onClick={onSelect}
      className={`flex w-full flex-col gap-1 border-b-2 border-border px-3 py-3 text-left ${selected ? 'bg-brand/30' : 'hover:bg-muted'}`}
    >
      <ScoreMeter score={match.score} label={t('match')} />
      <span className="font-display font-bold leading-tight">{match.title}</span>
      <span className="text-sm text-muted-foreground">{match.company}</span>
    </button>
  );
}
```

`today/match-detail.tsx` — общий для десктопа и мобильного раскрытия:
```tsx
'use client';

import { sourceInfo } from '@jp/core';
import { useFormatter, useTranslations } from 'next-intl';
import { ScoreMeter } from '@/components/ui/score-meter';
import type { FeedMatch } from './feed-types';

export type MatchAction = 'saved' | 'applied' | 'hide';

export function salaryText(t: ReturnType<typeof useTranslations>, m: Pick<FeedMatch, 'salaryMinUsd' | 'salaryMaxUsd'>) {
  if (m.salaryMinUsd && m.salaryMaxUsd && m.salaryMinUsd !== m.salaryMaxUsd) return t('salary', { min: m.salaryMinUsd, max: m.salaryMaxUsd });
  if (m.salaryMinUsd) return t('salaryFrom', { min: m.salaryMinUsd });
  if (m.salaryMaxUsd) return t('salaryTo', { max: m.salaryMaxUsd });
  return null;
}

export function MatchActions({ onAction, compact = false }: { onAction: (a: MatchAction) => void; compact?: boolean }) {
  const t = useTranslations('feed');
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'justify-between' : ''}`}>
      <button type="button" data-testid="match-hide" onClick={() => onAction('hide')} className="brutal brutal-press px-4 py-2 font-semibold">
        {t('hide')} {!compact && <kbd className="font-mono text-xs opacity-60">H</kbd>}
      </button>
      <button type="button" data-testid="match-save" onClick={() => onAction('saved')} className="brutal brutal-press px-4 py-2 font-semibold">
        {t('save')} {!compact && <kbd className="font-mono text-xs opacity-60">S</kbd>}
      </button>
      <button type="button" data-testid="match-applied" onClick={() => onAction('applied')} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">
        {t('applied')} {!compact && <kbd className="font-mono text-xs opacity-60">A</kbd>}
      </button>
    </div>
  );
}

export function MatchDetail({ match, onAction, showDescription = true }: { match: FeedMatch; onAction?: (a: MatchAction) => void; showDescription?: boolean }) {
  const t = useTranslations('today');
  const tf = useTranslations('feed');
  const format = useFormatter();
  const salary = salaryText(t, match);
  return (
    <article data-testid="match-detail" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ScoreMeter score={match.score} label={t('match')} />
        <h2 className="font-display text-2xl font-black leading-tight">{match.title}</h2>
        <p className="text-muted-foreground">{match.company}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase text-muted-foreground">
          <span>{t(`remote_${match.remoteType}`)}</span>
          {match.location && <span>{match.location}</span>}
          {match.seniority && <span>{t(`seniority_${match.seniority}`)}</span>}
          {salary && <span>{salary}</span>}
          <span>{format.relativeTime(new Date(match.createdAt))}</span>
        </p>
      </div>
      {match.summary && <p data-testid="match-summary" className="text-sm">{match.summary}</p>}
      {match.why && (
        <p data-testid="match-why" className="border-l-4 border-ai pl-3 text-sm">
          <span className="font-semibold">{t('why')}: </span>
          {match.why}
        </p>
      )}
      {(match.skills.length > 0 || match.missingSkills.length > 0) && (
        <ul className="flex flex-wrap gap-1.5" aria-label={tf('skills')}>
          {match.skills.map((s) => (
            <li key={s.name} data-testid="match-skill" data-matched={s.matched} className={`rounded-sm border-2 border-border px-1.5 py-0.5 font-mono text-xs ${s.matched ? 'bg-brand text-brand-foreground' : ''}`}>
              {s.matched ? '✓ ' : ''}{s.name}
            </li>
          ))}
          {match.missingSkills.map((name) => (
            <li key={`missing-${name}`} className="rounded-sm border-2 border-dashed border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
              ✗ {name}
            </li>
          ))}
        </ul>
      )}
      {match.breakdown && (
        <dl className="grid grid-cols-5 gap-2 font-mono text-xs" aria-label={tf('breakdown')}>
          {(['skills', 'role', 'seniority', 'location', 'salary'] as const).map((k) => (
            <div key={k} className="flex flex-col">
              <dt className="uppercase text-muted-foreground">{tf(`part_${k}`)}</dt>
              <dd className="font-bold">{match.breakdown![k]}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        {match.postings.filter((p) => /^https?:\/\//i.test(p.url)).map((p) => (
          <a key={p.url} href={p.url} target="_blank" rel="noopener" data-testid="match-open" className="brutal brutal-press px-3 py-1.5 text-sm font-semibold">
            {t('open', { source: sourceInfo(p.sourceId)?.name ?? p.sourceId })} ↗
          </a>
        ))}
      </div>
      {onAction && <MatchActions onAction={onAction} />}
      {showDescription && match.description && (
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-line border-t-2 border-border pt-3 text-sm">{match.description}</div>
      )}
    </article>
  );
}
```

`today/swipe-card.tsx`:
```tsx
'use client';

import { motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ScoreMeter } from '@/components/ui/score-meter';
import type { FeedMatch } from './feed-types';
import { MatchActions, MatchDetail, type MatchAction } from './match-detail';

const THRESHOLD = 120;

/** Top card of the mobile deck: drag right → save, left → hide. Every swipe has a button twin. */
export function SwipeCard({ match, onAction }: { match: FeedMatch; onAction: (a: MatchAction) => void }) {
  const t = useTranslations('today');
  const tf = useTranslations('feed');
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], reduce ? [0, 0] : [-12, 12]);
  const stamp = useTransform(x, (v) => (v > 40 ? 'SAVED' : v < -40 ? 'HIDE' : ''));
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <motion.article
        data-testid="job-match"
        data-match-id={match.id}
        className="brutal relative flex touch-pan-y flex-col gap-3 p-4"
        style={{ x, rotate }}
        drag={reduce ? false : 'x'}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={(_, info) => {
          if (info.offset.x > THRESHOLD) onAction('saved');
          else if (info.offset.x < -THRESHOLD) onAction('hide');
        }}
      >
        <motion.span aria-hidden className="absolute right-4 top-4 rotate-12 border-2 border-border bg-brand px-2 font-display font-black text-brand-foreground">
          {stamp}
        </motion.span>
        <ScoreMeter score={match.score} label={t('match')} />
        <h2 className="font-display text-xl font-black leading-tight">{match.title}</h2>
        <p className="text-muted-foreground">{match.company}</p>
        {match.summary && <p data-testid="match-summary" className="line-clamp-2 text-sm">{match.summary}</p>}
        <button type="button" className="self-start font-mono text-xs uppercase underline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? tf('lessDetails') : tf('moreDetails')}
        </button>
      </motion.article>
      {open && <MatchDetail match={match} />}
      <MatchActions onAction={onAction} compact />
    </div>
  );
}
```

- [ ] **Step 7: Лента**

`today/feed.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast, useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { hideMatch, restoreMatch, saveMatch } from './actions';
import { DEFAULT_FILTERS, filterMatches, type FeedFilters } from './feed-filter';
import { FeedListItem } from './feed-list-item';
import type { FeedMatch } from './feed-types';
import { MatchDetail, type MatchAction } from './match-detail';
import { SwipeCard } from './swipe-card';

type Done = { match: FeedMatch; index: number; action: MatchAction };

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

export function Feed({ matches, profiles, sources }: { matches: FeedMatch[]; profiles: { id: string; name: string }[]; sources: { id: string; name: string }[] }) {
  const t = useTranslations('feed');
  const [items, setItems] = useState(matches);
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(matches[0]?.id ?? null);
  const [done, setDone] = useState<Done[]>([]);
  const { toast, show, close } = useToast();

  const visible = useMemo(() => filterMatches(items, filters), [items, filters]);
  const selected = visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  const act = useCallback(
    async (match: FeedMatch, action: MatchAction) => {
      const index = items.findIndex((m) => m.id === match.id);
      if (index < 0) return;
      const next = visible[visible.findIndex((m) => m.id === match.id) + 1] ?? null;
      setItems((list) => list.filter((m) => m.id !== match.id));
      setSelectedId(next?.id ?? null);
      const restoreLocal = () => {
        setItems((list) => (list.some((m) => m.id === match.id) ? list : [...list.slice(0, index), match, ...list.slice(index)]));
        setSelectedId(match.id);
      };
      let applicationId: string | null = null;
      if (action === 'hide') {
        if (!(await hideMatch(match.id))) {
          restoreLocal();
          return show({ message: t('error'), tone: 'error' });
        }
      } else {
        const res = await saveMatch(match.id, action);
        if (!res.ok) {
          restoreLocal();
          return show({ message: t('error'), tone: 'error' });
        }
        if (res.created) applicationId = res.applicationId;
      }
      setDone((d) => [...d, { match, index, action }]);
      show({
        message: t(action === 'hide' ? 'hidden' : action === 'saved' ? 'saved' : 'appliedDone', { title: match.title }),
        undoLabel: t('undo'),
        onUndo: async () => {
          restoreLocal();
          setDone((d) => d.filter((x) => x.match.id !== match.id));
          if (!(await restoreMatch(match.id, applicationId))) show({ message: t('error'), tone: 'error' });
        },
      });
    },
    [items, visible, show, t],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isDesktop() || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))) return;
      const i = selected ? visible.findIndex((m) => m.id === selected.id) : -1;
      const key = e.key.toLowerCase();
      if (key === 'j' && visible[i + 1]) setSelectedId(visible[i + 1]!.id);
      else if (key === 'k' && i > 0) setSelectedId(visible[i - 1]!.id);
      else if (!selected) return;
      else if (key === 's') void act(selected, 'saved');
      else if (key === 'h') void act(selected, 'hide');
      else if (key === 'a') void act(selected, 'applied');
      else if (key === 'o' && selected.postings[0]) window.open(selected.postings[0].url, '_blank', 'noopener');
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, selected, visible]);

  const processed = done.length;
  const total = processed + visible.length;
  const savedCount = done.filter((d) => d.action !== 'hide').length;

  const select = (testId: string, label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <label className="flex flex-col gap-1 font-mono text-xs uppercase">
      {label}
      <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="brutal bg-card px-2 py-1 font-sans text-sm normal-case">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );

  return (
    <section data-testid="feed" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p data-testid="feed-progress" className="font-mono text-sm font-bold">{t('progress', { done: processed, total })}</p>
        <div className="flex flex-wrap gap-2">
          {profiles.length > 1 && select('filter-profile', t('filterProfile'), filters.profileId, (v) => setFilters({ ...filters, profileId: v }), [{ value: 'all', label: t('all') }, ...profiles.map((p) => ({ value: p.id, label: p.name }))])}
          {select('filter-min-score', t('filterScore'), String(filters.minScore), (v) => setFilters({ ...filters, minScore: Number(v) }), [0, 50, 70, 90].map((n) => ({ value: String(n), label: n === 0 ? t('all') : `≥ ${n}%` })))}
          {select('filter-remote', t('filterRemote'), filters.remote, (v) => setFilters({ ...filters, remote: v as FeedFilters['remote'] }), (['any', 'remote', 'hybrid', 'office'] as const).map((r) => ({ value: r, label: t(`remote_${r}`) })))}
          {select('filter-source', t('filterSource'), filters.source, (v) => setFilters({ ...filters, source: v }), [{ value: 'all', label: t('all') }, ...sources.map((s) => ({ value: s.id, label: s.name }))])}
        </div>
      </div>

      {visible.length === 0 ? (
        <div data-testid="feed-empty" className="brutal flex max-w-xl flex-col gap-3 p-6">
          <p className="font-display text-xl font-black">{t('empty')}</p>
          <p className="text-muted-foreground">{t('emptyStats', { saved: savedCount, hidden: processed - savedCount })}</p>
          <Link href="/board" className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('toBoard')}</Link>
        </div>
      ) : (
        <>
          <div className="hidden gap-6 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <nav aria-label={t('list')} className="brutal max-h-[75vh] overflow-y-auto p-0">
              {visible.map((m) => (
                <FeedListItem key={m.id} match={m} selected={m.id === selected?.id} onSelect={() => setSelectedId(m.id)} />
              ))}
            </nav>
            {selected && (
              <div className="brutal p-5">
                <MatchDetail match={selected} onAction={(a) => void act(selected, a)} />
              </div>
            )}
          </div>
          <div className="md:hidden">
            {visible[0] && <SwipeCard key={visible[0].id} match={visible[0]} onAction={(a) => void act(visible[0]!, a)} />}
          </div>
        </>
      )}
      <Toast toast={toast} onClose={close} />
    </section>
  );
}
```

- [ ] **Step 8: Страница**

`today/page.tsx` (полностью заменить):
```tsx
import { isLocale, type LocalizedText, localized, SENIORITIES, type Seniority, sourceInfo } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { cardSkills, matchedSkillsOf } from './card-skills';
import { Feed } from './feed';
import type { FeedMatch } from './feed-types';

const REMOTE = ['remote', 'hybrid', 'office'] as const;

export default async function TodayPage() {
  await requireUserId();
  const t = await getTranslations('today');
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const since = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const [{ data }, { data: profiles }] = await Promise.all([
    supabase
      .from('job_matches')
      .select(
        'id, score, created_at, breakdown, explanation, search_profile_id, jobs!inner(title, location, remote_type, seniority, salary_min_usd, salary_max_usd, summary, skills, description_text, is_job, companies(name), job_postings(source_id, url))',
      )
      .in('state', ['new', 'seen'])
      .eq('jobs.status', 'active')
      .not('jobs.is_job', 'is', false)
      .gte('created_at', since)
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('search_profiles').select('id, name, skills').order('created_at'),
  ]);

  const profileSkills = new Map((profiles ?? []).map((p) => [p.id, p.skills]));
  const matches: FeedMatch[] = (data ?? []).map((m) => {
    const matched = matchedSkillsOf(m.breakdown);
    const wanted = m.search_profile_id ? (profileSkills.get(m.search_profile_id) ?? []) : [];
    const b = m.breakdown as Partial<Record<'skills' | 'role' | 'seniority' | 'location' | 'salary', unknown>> | null;
    const num = (v: unknown) => (typeof v === 'number' ? v : 0);
    return {
      id: m.id,
      score: m.score,
      title: m.jobs.title,
      company: m.jobs.companies?.name ?? '',
      location: m.jobs.location,
      remoteType: REMOTE.find((r) => r === m.jobs.remote_type) ?? 'unknown',
      seniority: (SENIORITIES as readonly string[]).includes(m.jobs.seniority ?? '') ? (m.jobs.seniority as Seniority) : null,
      salaryMinUsd: m.jobs.salary_min_usd,
      salaryMaxUsd: m.jobs.salary_max_usd,
      summary: localized(m.jobs.summary as LocalizedText | null, locale) || null,
      why: localized(m.explanation as LocalizedText | null, locale) || null,
      description: m.jobs.description_text.slice(0, 8000),
      skills: cardSkills(m.jobs.skills, matched, 8),
      missingSkills: wanted.filter((s) => !matched.some((x) => x.toLowerCase() === s.toLowerCase())),
      breakdown: b ? { skills: num(b.skills), role: num(b.role), seniority: num(b.seniority), location: num(b.location), salary: num(b.salary) } : null,
      profileId: m.search_profile_id,
      createdAt: m.created_at,
      postings: m.jobs.job_postings.map((p) => ({ sourceId: p.source_id, url: p.url })),
    };
  });
  const sourceIds = [...new Set(matches.flatMap((m) => m.postings.map((p) => p.sourceId)))];

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      {matches.length === 0 ? (
        <div data-testid="today-empty" className="brutal flex max-w-xl flex-col gap-4 p-6">
          <p className="text-lg">{t('empty')}</p>
          <Link href="/search" className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">
            {t('setup')}
          </Link>
        </div>
      ) : (
        <Feed
          matches={matches}
          profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.name }))}
          sources={sourceIds.map((id) => ({ id, name: sourceInfo(id)?.name ?? id }))}
        />
      )}
    </section>
  );
}
```
Удалить `today/job-match-card.tsx` (и неиспользуемый импорт, если остался). Сообщение `today.subtitle` можно оставить в messages (не мешает) — но если тест паритета/линт ругается на неиспользуемое, не трогать.

- [ ] **Step 9: Сообщения**

В `apps/web/messages/en.json` добавить объект `feed`:
```json
"feed": {
  "progress": "{done} / {total}",
  "save": "Save",
  "applied": "Applied",
  "hide": "Hide",
  "undo": "Undo",
  "saved": "Saved to the board: {title}",
  "appliedDone": "Marked as applied: {title}",
  "hidden": "Hidden: {title}",
  "error": "Something went wrong. Try again.",
  "empty": "All caught up 🎉",
  "emptyStats": "Today: {saved} saved, {hidden} hidden.",
  "toBoard": "Open the board",
  "list": "Matches",
  "all": "All",
  "filterProfile": "Search",
  "filterScore": "Match",
  "filterRemote": "Format",
  "filterSource": "Board",
  "remote_any": "Any",
  "remote_remote": "Remote",
  "remote_hybrid": "Hybrid",
  "remote_office": "Office",
  "skills": "Skills",
  "breakdown": "Match breakdown",
  "part_skills": "Skills",
  "part_role": "Role",
  "part_seniority": "Level",
  "part_location": "Location",
  "part_salary": "Salary",
  "moreDetails": "Details",
  "lessDetails": "Hide details"
}
```
`uk.json`:
```json
"feed": {
  "progress": "{done} / {total}",
  "save": "Зберегти",
  "applied": "Відгукнувся",
  "hide": "Сховати",
  "undo": "Скасувати",
  "saved": "Збережено на дошку: {title}",
  "appliedDone": "Позначено як відгук: {title}",
  "hidden": "Сховано: {title}",
  "error": "Щось пішло не так. Спробуйте ще раз.",
  "empty": "Все переглянуто 🎉",
  "emptyStats": "Сьогодні: збережено {saved}, сховано {hidden}.",
  "toBoard": "Відкрити дошку",
  "list": "Збіги",
  "all": "Усі",
  "filterProfile": "Пошук",
  "filterScore": "Збіг",
  "filterRemote": "Формат",
  "filterSource": "Майданчик",
  "remote_any": "Будь-який",
  "remote_remote": "Віддалено",
  "remote_hybrid": "Гібрид",
  "remote_office": "Офіс",
  "skills": "Навички",
  "breakdown": "Розбір збігу",
  "part_skills": "Навички",
  "part_role": "Роль",
  "part_seniority": "Рівень",
  "part_location": "Локація",
  "part_salary": "Зарплата",
  "moreDetails": "Деталі",
  "lessDetails": "Сховати деталі"
}
```
`ru.json`:
```json
"feed": {
  "progress": "{done} / {total}",
  "save": "Сохранить",
  "applied": "Откликнулся",
  "hide": "Скрыть",
  "undo": "Отменить",
  "saved": "Сохранено на доску: {title}",
  "appliedDone": "Отмечено как отклик: {title}",
  "hidden": "Скрыто: {title}",
  "error": "Что-то пошло не так. Попробуйте ещё раз.",
  "empty": "Всё просмотрено 🎉",
  "emptyStats": "Сегодня: сохранено {saved}, скрыто {hidden}.",
  "toBoard": "Открыть доску",
  "list": "Совпадения",
  "all": "Все",
  "filterProfile": "Поиск",
  "filterScore": "Совпадение",
  "filterRemote": "Формат",
  "filterSource": "Площадка",
  "remote_any": "Любой",
  "remote_remote": "Удалённо",
  "remote_hybrid": "Гибрид",
  "remote_office": "Офис",
  "skills": "Навыки",
  "breakdown": "Разбор совпадения",
  "part_skills": "Навыки",
  "part_role": "Роль",
  "part_seniority": "Уровень",
  "part_location": "Локация",
  "part_salary": "Зарплата",
  "moreDetails": "Детали",
  "lessDetails": "Скрыть детали"
}
```

- [ ] **Step 10: E2E**

В `apps/web/e2e/today.spec.ts` обновить существующие тесты под новую разметку: элементы `job-match` и `match-*` ищутся с `.filter({ visible: true })`; скрытие — кнопкой `match-hide` в видимой раскладке (на десктопе сначала выбрать элемент списка по заголовку: `page.getByTestId('job-match').filter({ visible: true }).filter({ hasText: title }).click()`); проверки summary/why/skills — в видимом `match-detail` (десктоп) или на карточке/после «Details» (мобайл). Тест «Not a job» и «expired» — без изменений по смыслу.

Создать `apps/web/e2e/feed.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { countApplications, seedMatch } from './helpers/seed';

const visible = (page: import('@playwright/test').Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('saves a match to the board and can undo it', async ({ context, page }) => {
  const email = uniqueEmail('feed-save');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 91 });
  await page.goto('/en/today');
  await expect(visible(page, 'feed-progress')).toHaveText('0 / 1');
  await visible(page, 'match-save').click();
  await expect(visible(page, 'toast')).toContainText(title);
  await expect(visible(page, 'feed-empty')).toBeVisible();
  await visible(page, 'toast-undo').click();
  await expect(visible(page, 'job-match').filter({ hasText: title })).toBeVisible();
  await visible(page, 'match-save').click();
  await expect(visible(page, 'feed-empty')).toBeVisible();
  await expect.poll(() => countApplications(email)).toBe(1);
});

test('hides a match and keeps it hidden after reload', async ({ context, page }) => {
  const email = uniqueEmail('feed-hide');
  await loginAs(context, email);
  const { title } = await seedMatch(email, { score: 77 });
  await page.goto('/en/today');
  await visible(page, 'match-hide').click();
  await expect(visible(page, 'feed-empty')).toBeVisible();
  await page.reload();
  await expect(page.getByText(title)).toHaveCount(0);
});

test('keyboard: J/K move the selection, A marks applied', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'hotkeys are a desktop feature');
  const email = uniqueEmail('feed-keys');
  await loginAs(context, email);
  const low = await seedMatch(email, { score: 60 });
  const high = await seedMatch(email, { score: 95 });
  await page.goto('/en/today');
  await expect(visible(page, 'match-detail')).toContainText(high.title);
  await page.keyboard.press('j');
  await expect(visible(page, 'match-detail')).toContainText(low.title);
  await page.keyboard.press('k');
  await page.keyboard.press('a');
  await expect(visible(page, 'toast')).toContainText(high.title);
  await expect(visible(page, 'match-detail')).toContainText(low.title);
});

test('filters by minimum score', async ({ context, page }) => {
  const email = uniqueEmail('feed-filter');
  await loginAs(context, email);
  const low = await seedMatch(email, { score: 45 });
  const high = await seedMatch(email, { score: 92 });
  await page.goto('/en/today');
  await visible(page, 'filter-min-score').selectOption('70');
  await expect(page.getByText(high.title).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(low.title).filter({ visible: true })).toHaveCount(0);
});
```
Страница `/board` появится только в Task 4: в Task 3 тест проверяет карточку через хелпер `countApplications`; Task 4 добавит в него переход на `/board`. Хелпер и `seed.ts`:
```ts
export async function countApplications(email: string): Promise<number> {
  const db = admin();
  const userId = await userIdByEmail(email);
  const { count, error } = await db.from('applications').select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw error;
  return count ?? 0;
}
```

- [ ] **Step 11: Проверка и commit**

Run: `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e`
Expected: PASS (порт 3000 занят другим приложением пользователя; не убивать чужие процессы).

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): Today feed — mail-client layout, swipe deck, undo, filters, hotkeys

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Доска — колонки, dnd-kit, срочность, «Действия на сегодня», панель карточки, отказ, оффер

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/board/{board-types.ts,board.tsx,board-column.tsx,board-card.tsx,today-actions.tsx,card-panel.tsx,reject-dialog.tsx,confetti.tsx,actions.ts}`, `apps/web/e2e/board.spec.ts`
- Modify: `apps/web/package.json` (dnd-kit), `apps/web/src/app/[locale]/(app)/board/page.tsx`, `apps/web/messages/{en,uk,ru}.json`, `apps/web/e2e/helpers/seed.ts` (`seedApplication`), `apps/web/e2e/feed.spec.ts` (проверка `/board`)

**Interfaces:**
- Consumes: `applicationUrgency`, `smartSort`, `columnCounters`, `todayActions`, `rankBetween`, `rankAtTop`, `rankAtEnd`, `REJECTION_STAGES`, `REJECTION_REASONS`, `rejectionInputSchema`, `applicationPatchSchema`, `localized`, `isLocale` (`@jp/core`); RPC `move_application`, `reject_application`; `Toast`/`useToast` (Task 3).
- Produces:
  - `type BoardColumn = { id: string; key: string; title: string; kind: 'active' | 'won' | 'lost' }`, `type BoardCard` (ниже), `type BoardLabel = { id: string; key: string | null; name: string | null; color: string }`.
  - Server actions (`board/actions.ts`): `moveApplication(id, columnId, rank): Promise<boolean>`, `rejectApplication(id, columnId, rank, input: RejectionInput): Promise<boolean>`, `updateApplication(id, patch: ApplicationPatch): Promise<boolean>`, `setApplicationLabel(id, labelId, on: boolean): Promise<boolean>`, `createLabel(name, color): Promise<BoardLabel | null>`, `markPinged(id): Promise<boolean>`, `markResponse(id): Promise<boolean>`, `deleteApplication(id): Promise<boolean>`, `getApplicationEvents(id): Promise<{ type: string; payload: unknown; createdAt: string }[]>`.
  - Test ids: `board`, `board-column` (`data-column-key`), `column-count`, `column-sort`, `board-card` (`data-card-id`), `card-urgency` (`data-urgency`), `today-actions`, `today-action` (`data-kind`), `card-panel`, `panel-move`, `panel-save`, `panel-salary`, `panel-notes`, `panel-next-action`, `panel-pinged`, `panel-response`, `panel-delete`, `panel-history`, `panel-label` (`data-label-id`, `aria-pressed`), `reject-dialog`, `reject-stage`, `reject-by`, `reject-reason` (`value` = ключ), `reject-note`, `reject-confirm`, `confetti`.

- [ ] **Step 1: Зависимости**

`apps/web/package.json` → `dependencies`: `"@dnd-kit/core": "6.3.1"`, `"@dnd-kit/sortable": "10.0.0"`, `"@dnd-kit/utilities": "3.2.2"`. Run: `pnpm install`.

- [ ] **Step 2: Типы и server actions**

`board/board-types.ts`:
```ts
import type { Urgency } from '@jp/core';

export type BoardColumn = { id: string; key: string; title: string; kind: 'active' | 'won' | 'lost' };
export type BoardLabel = { id: string; key: string | null; name: string | null; color: string };

export type BoardCard = {
  id: string;
  columnId: string;
  rank: string;
  title: string;
  company: string;
  url: string | null;
  sourceId: string | null;
  salary: string | null;
  notes: string | null;
  contactName: string | null;
  contactUrl: string | null;
  appliedAt: string | null;
  nextActionAt: string | null;
  firstResponseAt: string | null;
  lastActivityAt: string | null;
  followUpCount: number;
  outcome: string;
  labelIds: string[];
};

export type BoardCardView = BoardCard & { urgency: Urgency };
```

`board/actions.ts`:
```ts
'use server';

import { type ApplicationPatch, applicationPatchSchema, type RejectionInput, rejectionInputSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { BoardLabel } from './board-types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANK = /^[0-9A-Za-z]{1,64}$/;

async function client() {
  return (await getUserId()) ? createClient() : null;
}

function done(error: { message: string } | null, what: string): boolean {
  if (error) console.error(`${what} failed`, error.message);
  revalidatePath('/[locale]/board', 'page');
  return !error;
}

async function event(supabase: Awaited<ReturnType<typeof createClient>>, applicationId: string, type: string, payload: object = {}) {
  const userId = await getUserId();
  await supabase.from('application_events').insert({ application_id: applicationId, user_id: userId!, type, payload });
}

export async function moveApplication(id: string, columnId: string, rank: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id) || !UUID.test(columnId) || !RANK.test(rank)) return false;
  const { error } = await supabase.rpc('move_application', { p_id: id, p_column_id: columnId, p_rank: rank });
  return done(error, 'moveApplication');
}

export async function rejectApplication(id: string, columnId: string, rank: string, input: RejectionInput): Promise<boolean> {
  const supabase = await client();
  const parsed = rejectionInputSchema.safeParse(input);
  if (!supabase || !parsed.success || !UUID.test(id) || !UUID.test(columnId) || !RANK.test(rank)) return false;
  const { error } = await supabase.rpc('reject_application', {
    p_id: id,
    p_column_id: columnId,
    p_rank: rank,
    p_stage: parsed.data.stage,
    p_by: parsed.data.by,
    p_reasons: parsed.data.reasons,
    p_note: parsed.data.note,
  });
  return done(error, 'rejectApplication');
}

export async function updateApplication(id: string, patch: ApplicationPatch): Promise<boolean> {
  const supabase = await client();
  const parsed = applicationPatchSchema.safeParse(patch);
  if (!supabase || !parsed.success || !UUID.test(id)) return false;
  const p = parsed.data;
  const { error } = await supabase
    .from('applications')
    .update({
      salary: p.salary || null,
      notes: p.notes || null,
      next_action_at: p.nextActionAt,
      contact: { ...(p.contactName ? { name: p.contactName } : {}), ...(p.contactUrl ? { url: p.contactUrl } : {}) },
    })
    .eq('id', id);
  if (!error && p.notes) await event(supabase, id, 'note');
  return done(error, 'updateApplication');
}

export async function setApplicationLabel(id: string, labelId: string, on: boolean): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id) || !UUID.test(labelId)) return false;
  const { error } = on
    ? await supabase.from('application_labels').upsert({ application_id: id, label_id: labelId }, { ignoreDuplicates: true })
    : await supabase.from('application_labels').delete().eq('application_id', id).eq('label_id', labelId);
  if (!error) await event(supabase, id, 'label', { labelId, on });
  return done(error, 'setApplicationLabel');
}

export async function createLabel(name: string, color: string): Promise<BoardLabel | null> {
  const supabase = await client();
  const trimmed = name.trim();
  if (!supabase || !trimmed || trimmed.length > 40 || !/^#[0-9A-Fa-f]{6}$/.test(color)) return null;
  const userId = await getUserId();
  const { data, error } = await supabase.from('labels').insert({ user_id: userId!, name: trimmed, color }).select('id, key, name, color').single();
  if (error) console.error('createLabel failed', error.message);
  revalidatePath('/[locale]/board', 'page');
  return data ?? null;
}

export async function markPinged(id: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return false;
  const { data } = await supabase.from('applications').select('follow_up_count').eq('id', id).maybeSingle();
  if (!data) return false;
  const { error } = await supabase
    .from('applications')
    .update({ follow_up_count: data.follow_up_count + 1, last_activity_at: new Date().toISOString() })
    .eq('id', id);
  if (!error) await event(supabase, id, 'follow_up_sent', { count: data.follow_up_count + 1 });
  return done(error, 'markPinged');
}

export async function markResponse(id: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return false;
  const now = new Date().toISOString();
  const { error } = await supabase.from('applications').update({ first_response_at: now, last_activity_at: now }).eq('id', id);
  if (!error) await event(supabase, id, 'response');
  return done(error, 'markResponse');
}

export async function deleteApplication(id: string): Promise<boolean> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return false;
  const { error } = await supabase.from('applications').delete().eq('id', id);
  return done(error, 'deleteApplication');
}

export async function getApplicationEvents(id: string): Promise<{ type: string; payload: unknown; createdAt: string }[]> {
  const supabase = await client();
  if (!supabase || !UUID.test(id)) return [];
  const { data } = await supabase
    .from('application_events')
    .select('type, payload, created_at')
    .eq('application_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data ?? []).map((e) => ({ type: e.type, payload: e.payload, createdAt: e.created_at }));
}
```

- [ ] **Step 3: Страница**

`board/page.tsx`:
```tsx
import { isLocale, type LocalizedText, localized } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Board } from './board';
import type { BoardCard, BoardColumn, BoardLabel } from './board-types';

export default async function BoardPage() {
  const userId = await requireUserId();
  const t = await getTranslations('board');
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const [{ data: columns }, { data: apps }, { data: labels }, { data: profile }] = await Promise.all([
    supabase.from('board_columns').select('id, key, title, kind').order('position'),
    supabase
      .from('applications')
      .select(
        'id, column_id, rank, title, company, url, source_id, salary, notes, contact, applied_at, next_action_at, first_response_at, last_activity_at, follow_up_count, outcome, application_labels(label_id)',
      )
      .order('rank'),
    supabase.from('labels').select('id, key, name, color').order('key', { nullsFirst: false }),
    supabase.from('profiles').select('follow_up_days, ghost_after_days').eq('id', userId).single(),
  ]);

  const boardColumns: BoardColumn[] = (columns ?? []).map((c) => ({
    id: c.id,
    key: c.key,
    title: localized(c.title as LocalizedText, locale) || c.key,
    kind: c.kind === 'won' || c.kind === 'lost' ? c.kind : 'active',
  }));
  const cards: BoardCard[] = (apps ?? []).map((a) => {
    const contact = (a.contact ?? {}) as { name?: unknown; url?: unknown };
    return {
      id: a.id,
      columnId: a.column_id,
      rank: a.rank,
      title: a.title,
      company: a.company,
      url: a.url,
      sourceId: a.source_id,
      salary: a.salary,
      notes: a.notes,
      contactName: typeof contact.name === 'string' ? contact.name : null,
      contactUrl: typeof contact.url === 'string' ? contact.url : null,
      appliedAt: a.applied_at,
      nextActionAt: a.next_action_at,
      firstResponseAt: a.first_response_at,
      lastActivityAt: a.last_activity_at,
      followUpCount: a.follow_up_count,
      outcome: a.outcome,
      labelIds: a.application_labels.map((l) => l.label_id),
    };
  });

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      <Board
        columns={boardColumns}
        cards={cards}
        labels={(labels ?? []) as BoardLabel[]}
        rules={{ followUpDays: profile?.follow_up_days ?? [5, 10], ghostAfterDays: profile?.ghost_after_days ?? 21 }}
        now={new Date().toISOString()}
      />
    </section>
  );
}
```

- [ ] **Step 4: Компоненты доски**

`board/confetti.tsx`:
```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';

const COLORS = ['var(--brand)', 'var(--ai)', 'var(--success)', 'var(--warning)'];

/** Short brutalist confetti burst for an offer (spec 7.8); nothing with reduced motion. */
export function Confetti({ onDone }: { onDone: () => void }) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div data-testid="confetti" aria-hidden className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 28 }, (_, i) => (
        <motion.span
          key={i}
          className="absolute top-1/3 left-1/2 h-3 w-2 border border-border"
          style={{ background: COLORS[i % COLORS.length] }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: (i % 2 ? 1 : -1) * (60 + ((i * 37) % 260)), y: 200 + ((i * 53) % 300), rotate: (i * 47) % 360, opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          onAnimationComplete={i === 0 ? onDone : undefined}
        />
      ))}
    </div>
  );
}
```

`board/board-card.tsx`:
```tsx
'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useFormatter, useTranslations } from 'next-intl';
import type { BoardCardView, BoardLabel } from './board-types';

const URGENCY_STYLE: Record<string, string> = {
  interview_soon: 'bg-ai text-white',
  overdue: 'bg-danger text-white',
  ghosting: 'bg-foreground text-background',
  ping: 'bg-warning text-brand-foreground',
};

export function BoardCardItem({ card, labels, labelName, now, onOpen }: {
  card: BoardCardView;
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  now: Date;
  onOpen: () => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
  const own = labels.filter((l) => card.labelIds.includes(l.id));
  return (
    <article
      ref={setNodeRef}
      data-testid="board-card"
      data-card-id={card.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`brutal flex cursor-grab flex-col gap-1.5 p-3 ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === 'Enter' && !e.defaultPrevented) onOpen();
      }}
    >
      <span className="font-display font-bold leading-tight">{card.title}</span>
      <span className="text-sm text-muted-foreground">{card.company}</span>
      {own.length > 0 && (
        <span className="flex flex-wrap gap-1">
          {own.map((l) => (
            <span key={l.id} className="rounded-sm border border-border px-1 font-mono text-[10px] uppercase" style={{ background: l.color }}>
              {labelName(l)}
            </span>
          ))}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
        {card.appliedAt && <span>{t('appliedAgo', { ago: format.relativeTime(new Date(card.appliedAt), now) })}</span>}
        {card.urgency in URGENCY_STYLE && (
          <span data-testid="card-urgency" data-urgency={card.urgency} className={`rounded-sm border border-border px-1 font-bold uppercase ${URGENCY_STYLE[card.urgency]}`}>
            {t(`urgency_${card.urgency}`)}
          </span>
        )}
      </span>
    </article>
  );
}
```

`board/board-column.tsx`:
```tsx
'use client';

import { columnCounters, smartSort } from '@jp/core';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import { BoardCardItem } from './board-card';
import type { BoardCardView as Card, BoardColumn, BoardLabel } from './board-types';

export function BoardColumnView({ column, cards, sort, onToggleSort, labels, labelName, now, onOpen }: {
  column: BoardColumn;
  cards: Card[];
  sort: 'smart' | 'manual';
  onToggleSort: () => void;
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const t = useTranslations('board');
  const { setNodeRef, isOver } = useDroppable({ id: `column:${column.id}` });
  const ordered = sort === 'smart' ? smartSort(cards) : cards;
  const { total, needsAction } = columnCounters(cards);
  return (
    <section data-testid="board-column" data-column-key={column.key} aria-label={column.title} className="flex w-72 shrink-0 flex-col gap-3">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-black uppercase">{column.title}</h2>
        <span data-testid="column-count" className="font-mono text-xs font-bold">
          {total}{needsAction > 0 && <span className="text-danger"> · ● {needsAction}</span>}
        </span>
        <button type="button" data-testid="column-sort" onClick={onToggleSort} className="font-mono text-[10px] uppercase underline" aria-label={t('sortToggle')}>
          {t(sort === 'smart' ? 'sortSmart' : 'sortManual')}
        </button>
      </header>
      <SortableContext items={ordered.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`flex min-h-24 flex-col gap-2 rounded-brutal border-2 border-dashed p-2 ${isOver ? 'border-brand bg-brand/10' : 'border-transparent'}`}>
          {ordered.map((c) => (
            <BoardCardItem key={c.id} card={c} labels={labels} labelName={labelName} now={now} onOpen={() => onOpen(c.id)} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}
```

`board/today-actions.tsx`:
```tsx
'use client';

import { todayActions } from '@jp/core';
import { useFormatter, useTranslations } from 'next-intl';
import type { BoardCardView } from './board-types';

export function TodayActions({ cards, onPinged, onOpen, onGhosted }: {
  cards: BoardCardView[];
  onPinged: (id: string) => void;
  onOpen: (id: string) => void;
  onGhosted: (id: string) => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const actions = todayActions(cards.map((c) => ({ id: c.id, urgency: c.urgency, nextActionAt: c.nextActionAt ? new Date(c.nextActionAt) : null })));
  if (actions.length === 0) return null;
  const byId = new Map(cards.map((c) => [c.id, c]));
  return (
    <aside data-testid="today-actions" className="brutal flex flex-col gap-2 p-4">
      <h2 className="font-display text-lg font-black">{t('todayTitle', { count: actions.length })}</h2>
      <ul className="flex flex-col gap-2">
        {actions.map((a) => {
          const card = byId.get(a.id)!;
          return (
            <li key={a.id} data-testid="today-action" data-kind={a.kind} className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-border pb-2 last:border-b-0">
              <span>
                <span className="font-semibold">{t(`today_${a.kind}`)}</span>: {card.company} — {card.title}
                {a.at && <span className="font-mono text-xs"> · {format.dateTime(a.at, { dateStyle: 'medium', timeStyle: 'short' })}</span>}
              </span>
              {a.kind === 'ping' && (
                <button type="button" onClick={() => onPinged(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionPinged')}</button>
              )}
              {a.kind === 'interview' && (
                <button type="button" onClick={() => onOpen(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionOpen')}</button>
              )}
              {a.kind === 'ghosting' && (
                <button type="button" onClick={() => onGhosted(a.id)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionGhosted')}</button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
```

`board/reject-dialog.tsx`:
```tsx
'use client';

import { REJECTION_REASONS, REJECTION_STAGES, type RejectionInput, type RejectionReason, type RejectionStage } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function RejectDialog({ initialReasons = [], onConfirm, onCancel }: {
  initialReasons?: RejectionReason[];
  onConfirm: (input: RejectionInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('board');
  const [stage, setStage] = useState<RejectionStage>('application');
  const [by, setBy] = useState<'company' | 'me'>('company');
  const [reasons, setReasons] = useState<RejectionReason[]>(initialReasons);
  const [note, setNote] = useState('');
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reject-title" data-testid="reject-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        className="brutal flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (reasons.length > 0) onConfirm({ stage, by, reasons, note });
        }}
      >
        <h2 id="reject-title" className="font-display text-xl font-black">{t('rejectTitle')}</h2>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('rejectStage')}
          <select data-testid="reject-stage" value={stage} onChange={(e) => setStage(e.target.value as RejectionStage)} className="brutal bg-card px-2 py-1 font-sans text-sm normal-case">
            {REJECTION_STAGES.map((s) => <option key={s} value={s}>{t(`stage_${s}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('rejectBy')}
          <select data-testid="reject-by" value={by} onChange={(e) => setBy(e.target.value as 'company' | 'me')} className="brutal bg-card px-2 py-1 font-sans text-sm normal-case">
            <option value="company">{t('byCompany')}</option>
            <option value="me">{t('byMe')}</option>
          </select>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="font-mono text-xs uppercase">{t('rejectReasons')}</legend>
          <div className="grid grid-cols-2 gap-1">
            {REJECTION_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="reject-reason"
                  value={r}
                  checked={reasons.includes(r)}
                  onChange={(e) => setReasons((list) => (e.target.checked ? [...list, r] : list.filter((x) => x !== r)))}
                />
                {t(`reason_${r}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('rejectNote')}
          <textarea data-testid="reject-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} className="brutal min-h-20 bg-card px-2 py-1 font-sans text-sm normal-case" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 font-semibold">{t('cancel')}</button>
          <button type="submit" data-testid="reject-confirm" disabled={reasons.length === 0} className="brutal brutal-press bg-danger px-4 py-2 font-semibold text-white disabled:opacity-50">
            {t('rejectConfirm')}
          </button>
        </div>
      </form>
    </div>
  );
}
```

`board/card-panel.tsx`:
```tsx
'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { createLabel, getApplicationEvents, markPinged, markResponse, setApplicationLabel, updateApplication } from './actions';
import type { BoardCardView, BoardColumn, BoardLabel } from './board-types';

const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

export function CardPanel({ card, columns, labels, labelName, onClose, onMove, onDelete, onChanged, onLabelCreated }: {
  card: BoardCardView;
  columns: BoardColumn[];
  labels: BoardLabel[];
  labelName: (l: BoardLabel) => string;
  onClose: () => void;
  onMove: (columnId: string) => void;
  onDelete: () => void;
  onChanged: (patch: Partial<BoardCardView>) => void;
  onLabelCreated: (l: BoardLabel) => void;
}) {
  const t = useTranslations('board');
  const format = useFormatter();
  const [events, setEvents] = useState<{ type: string; createdAt: string }[]>([]);
  const [salary, setSalary] = useState(card.salary ?? '');
  const [notes, setNotes] = useState(card.notes ?? '');
  const [next, setNext] = useState(toLocalInput(card.nextActionAt));
  const [contactName, setContactName] = useState(card.contactName ?? '');
  const [contactUrl, setContactUrl] = useState(card.contactUrl ?? '');
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#C6F432');
  const [error, setError] = useState(false);

  useEffect(() => {
    void getApplicationEvents(card.id).then(setEvents);
  }, [card.id, card.columnId, card.labelIds.length, card.followUpCount]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    const patch = {
      salary: salary.trim() || null,
      notes: notes.trim() || null,
      nextActionAt: next ? new Date(next).toISOString() : null,
      contactName: contactName.trim() || null,
      contactUrl: contactUrl.trim() || null,
    };
    const ok = await updateApplication(card.id, patch);
    setError(!ok);
    if (ok) onChanged({ salary: patch.salary, notes: patch.notes, nextActionAt: patch.nextActionAt, contactName: patch.contactName, contactUrl: patch.contactUrl });
  };

  const field = 'brutal bg-card px-2 py-1 font-sans text-sm normal-case';
  return (
    <aside role="dialog" aria-modal="true" aria-labelledby="panel-title" data-testid="card-panel" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col gap-4 overflow-y-auto border-l-2 border-border bg-background p-5 shadow-[-4px_0_0_var(--shadow-color)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="panel-title" className="font-display text-xl font-black leading-tight">{card.title}</h2>
          <p className="text-muted-foreground">{card.company}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('close')} className="font-mono text-lg">✕</button>
      </div>
      {card.url && <a href={card.url} target="_blank" rel="noopener" className="font-mono text-sm underline">{t('openOriginal')} ↗</a>}
      <label className="flex flex-col gap-1 font-mono text-xs uppercase">
        {t('moveTo')}
        <select data-testid="panel-move" value={card.columnId} onChange={(e) => onMove(e.target.value)} className={field}>
          {columns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" data-testid="panel-pinged" onClick={async () => { if (await markPinged(card.id)) onChanged({ followUpCount: card.followUpCount + 1, lastActivityAt: new Date().toISOString() }); }} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('actionPinged')}</button>
        <button type="button" data-testid="panel-response" onClick={async () => { const now = new Date().toISOString(); if (await markResponse(card.id)) onChanged({ firstResponseAt: now, lastActivityAt: now }); }} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('gotReply')}</button>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-xs uppercase">{t('labels')}</legend>
        <div className="flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const on = card.labelIds.includes(l.id);
            return (
              <button
                key={l.id}
                type="button"
                data-testid="panel-label"
                data-label-id={l.id}
                aria-pressed={on}
                onClick={async () => {
                  if (await setApplicationLabel(card.id, l.id, !on)) onChanged({ labelIds: on ? card.labelIds.filter((x) => x !== l.id) : [...card.labelIds, l.id] });
                }}
                className={`rounded-sm border-2 border-border px-2 py-0.5 font-mono text-xs uppercase ${on ? '' : 'opacity-50'}`}
                style={{ background: on ? l.color : undefined }}
              >
                {labelName(l)}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} maxLength={40} placeholder={t('newLabel')} className={`${field} flex-1`} />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label={t('labelColor')} className="h-9 w-10 border-2 border-border" />
          <button type="button" onClick={async () => { const l = await createLabel(newLabel, newColor.toUpperCase()); if (l) { onLabelCreated(l); setNewLabel(''); } }} className="brutal brutal-press px-3 text-sm font-semibold">+</button>
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('salary')}<input data-testid="panel-salary" value={salary} maxLength={120} onChange={(e) => setSalary(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('nextAction')}<input data-testid="panel-next-action" type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('contactName')}<input value={contactName} maxLength={120} onChange={(e) => setContactName(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('contactUrl')}<input type="url" value={contactUrl} onChange={(e) => setContactUrl(e.target.value)} className={field} /></label>
      <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('notes')}<textarea data-testid="panel-notes" value={notes} maxLength={5000} onChange={(e) => setNotes(e.target.value)} className={`${field} min-h-24`} /></label>
      <div className="flex items-center gap-3">
        <button type="button" data-testid="panel-save" onClick={save} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('save')}</button>
        {error && <span role="alert" className="text-sm text-danger">{t('saveError')}</span>}
        <button type="button" data-testid="panel-delete" onClick={() => { if (window.confirm(t('deleteConfirm'))) onDelete(); }} className="ml-auto text-sm text-danger underline">{t('delete')}</button>
      </div>
      <section data-testid="panel-history" className="flex flex-col gap-1 border-t-2 border-border pt-3">
        <h3 className="font-mono text-xs uppercase">{t('history')}</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {events.map((e, i) => (
            <li key={i}>{t(`event_${e.type}`)} · <span className="font-mono text-xs text-muted-foreground">{format.relativeTime(new Date(e.createdAt))}</span></li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
```

`board/board.tsx`:
```tsx
'use client';

import { applicationUrgency, type FollowUpRules, rankAtEnd, rankBetween, type RejectionInput, type RejectionReason, smartSort } from '@jp/core';
import { closestCorners, DndContext, type DragEndEvent, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Toast, useToast } from '@/components/ui/toast';
import { deleteApplication, markPinged, moveApplication, rejectApplication } from './actions';
import { BoardColumnView } from './board-column';
import type { BoardCard, BoardCardView, BoardColumn, BoardLabel } from './board-types';
import { CardPanel } from './card-panel';
import { Confetti } from './confetti';
import { RejectDialog } from './reject-dialog';
import { TodayActions } from './today-actions';

type PendingReject = { id: string; columnId: string; rank: string; reasons: RejectionReason[] };

export function Board({ columns, cards: initial, labels: initialLabels, rules, now: nowIso }: {
  columns: BoardColumn[];
  cards: BoardCard[];
  labels: BoardLabel[];
  rules: FollowUpRules;
  now: string;
}) {
  const t = useTranslations('board');
  const now = useMemo(() => new Date(nowIso), [nowIso]);
  const [cards, setCards] = useState(initial);
  const [labels, setLabels] = useState(initialLabels);
  const [sort, setSort] = useState<Record<string, 'smart' | 'manual'>>(
    Object.fromEntries(columns.map((c) => [c.id, c.kind === 'active' ? 'smart' : 'manual'])),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingReject, setPendingReject] = useState<PendingReject | null>(null);
  const [confetti, setConfetti] = useState(false);
  const { toast, show, close } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);
  const views: BoardCardView[] = useMemo(
    () =>
      cards.map((c) => ({
        ...c,
        urgency: applicationUrgency(
          {
            columnKind: columnById.get(c.columnId)?.kind ?? 'active',
            outcome: c.outcome,
            appliedAt: c.appliedAt ? new Date(c.appliedAt) : null,
            firstResponseAt: c.firstResponseAt ? new Date(c.firstResponseAt) : null,
            lastActivityAt: c.lastActivityAt ? new Date(c.lastActivityAt) : null,
            nextActionAt: c.nextActionAt ? new Date(c.nextActionAt) : null,
          },
          now,
          rules,
        ),
      })),
    [cards, columnById, now, rules],
  );
  const inColumn = (columnId: string) => views.filter((c) => c.columnId === columnId).sort((a, b) => (a.rank < b.rank ? -1 : 1));
  const shown = (columnId: string) => (sort[columnId] === 'smart' ? smartSort(inColumn(columnId)) : inColumn(columnId));
  const labelName = (l: BoardLabel) => (l.key ? t(`label_${l.key}`) : (l.name ?? ''));

  const patchLocal = (id: string, patch: Partial<BoardCard>) => setCards((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const commitMove = async (id: string, columnId: string, rank: string) => {
    const before = cards;
    const target = columnById.get(columnId)!;
    const card = cards.find((c) => c.id === id)!;
    patchLocal(id, {
      columnId,
      rank,
      outcome: target.kind === 'won' ? 'offer' : target.kind === 'active' ? 'open' : card.outcome,
      appliedAt: target.key === 'applied' && !card.appliedAt ? new Date().toISOString() : card.appliedAt,
    });
    if (!(await moveApplication(id, columnId, rank))) {
      setCards(before);
      return show({ message: t('moveError'), tone: 'error' });
    }
    if (target.kind === 'won' && card.columnId !== columnId) setConfetti(true);
  };

  const requestMove = (id: string, columnId: string, rank: string, reasons: RejectionReason[] = []) => {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const target = columnById.get(columnId);
    if (target?.kind === 'lost' && card.columnId !== columnId) setPendingReject({ id, columnId, rank, reasons });
    else void commitMove(id, columnId, rank);
  };

  const endRank = (columnId: string, excludeId: string) => {
    const list = inColumn(columnId).filter((c) => c.id !== excludeId);
    return rankAtEnd(list.at(-1)?.rank ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over) return;
    const id = String(active.id);
    const overId = String(over.id);
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    const overCard = cards.find((c) => c.id === overId);
    const columnId = overId.startsWith('column:') ? overId.slice('column:'.length) : overCard?.columnId;
    if (!columnId) return;
    if (!overCard || sort[columnId] === 'smart') return requestMove(id, columnId, card.columnId === columnId ? card.rank : endRank(columnId, id));
    // Manual order: place the card where it was dropped among the column's ranked cards.
    const ids = inColumn(columnId).map((c) => c.id).filter((x) => x !== id);
    const overIndex = ids.indexOf(overId);
    const sameColumn = card.columnId === columnId;
    const order = sameColumn ? arrayMove(inColumn(columnId).map((c) => c.id), inColumn(columnId).findIndex((c) => c.id === id), inColumn(columnId).findIndex((c) => c.id === overId)) : [...ids.slice(0, overIndex), id, ...ids.slice(overIndex)];
    const at = order.indexOf(id);
    const rankOf = (cid: string | undefined) => (cid ? cards.find((c) => c.id === cid)!.rank : null);
    if (sameColumn && at === inColumn(columnId).findIndex((c) => c.id === id)) return;
    requestMove(id, columnId, rankBetween(rankOf(order[at - 1]), rankOf(order[at + 1])));
  };

  const confirmReject = async (input: RejectionInput) => {
    if (!pendingReject) return;
    const { id, columnId, rank } = pendingReject;
    setPendingReject(null);
    const before = cards;
    patchLocal(id, { columnId, rank, outcome: 'rejected' });
    if (!(await rejectApplication(id, columnId, rank, input))) {
      setCards(before);
      show({ message: t('moveError'), tone: 'error' });
    }
  };

  const lost = columns.find((c) => c.kind === 'lost');
  const open = views.find((c) => c.id === openId) ?? null;
  const active = views.find((c) => c.id === activeId) ?? null;

  return (
    <div data-testid="board" className="flex flex-col gap-6">
      <TodayActions
        cards={views}
        onOpen={setOpenId}
        onPinged={async (id) => {
          if (await markPinged(id)) patchLocal(id, { lastActivityAt: new Date().toISOString(), followUpCount: (cards.find((c) => c.id === id)?.followUpCount ?? 0) + 1 });
          else show({ message: t('moveError'), tone: 'error' });
        }}
        onGhosted={(id) => lost && requestMove(id, lost.id, endRank(lost.id, id), ['no_feedback'])}
      />
      {cards.length === 0 && <p data-testid="board-empty" className="text-muted-foreground">{t('empty')}</p>}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active: a }) => setActiveId(String(a.id))} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.map((col) => (
            <BoardColumnView
              key={col.id}
              column={col}
              cards={shown(col.id)}
              sort={sort[col.id] ?? 'manual'}
              onToggleSort={() => setSort((s) => ({ ...s, [col.id]: s[col.id] === 'smart' ? 'manual' : 'smart' }))}
              labels={labels}
              labelName={labelName}
              now={now}
              onOpen={setOpenId}
            />
          ))}
        </div>
        <DragOverlay>{active && <div className="brutal rotate-2 p-3 font-display font-bold">{active.title}</div>}</DragOverlay>
      </DndContext>
      {open && (
        <CardPanel
          card={open}
          columns={columns}
          labels={labels}
          labelName={labelName}
          onClose={() => setOpenId(null)}
          onMove={(columnId) => requestMove(open.id, columnId, endRank(columnId, open.id))}
          onDelete={async () => {
            const before = cards;
            setCards((list) => list.filter((c) => c.id !== open.id));
            setOpenId(null);
            if (!(await deleteApplication(open.id))) {
              setCards(before);
              show({ message: t('moveError'), tone: 'error' });
            }
          }}
          onChanged={(patch) => patchLocal(open.id, patch)}
          onLabelCreated={(l) => setLabels((list) => [...list, l])}
        />
      )}
      {pendingReject && <RejectDialog initialReasons={pendingReject.reasons} onConfirm={confirmReject} onCancel={() => setPendingReject(null)} />}
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
      <Toast toast={toast} onClose={close} />
    </div>
  );
}
```

- [ ] **Step 5: Сообщения**

`en.json` — объект `board` (заменить существующий `pages.board` не нужно; добавить новый объект верхнего уровня `board`):
```json
"board": {
  "title": "Application board",
  "empty": "No cards yet. Save a job from Today or add one manually.",
  "appliedAgo": "applied {ago}",
  "urgency_interview_soon": "Interview soon",
  "urgency_overdue": "Overdue",
  "urgency_ghosting": "Ghosting?",
  "urgency_ping": "Time to ping",
  "sortToggle": "Toggle sorting",
  "sortSmart": "Smart",
  "sortManual": "Manual",
  "todayTitle": "{count, plural, one {# action for today} other {# actions for today}}",
  "today_interview": "Interview",
  "today_ping": "Ping",
  "today_ghosting": "No reply",
  "actionPinged": "I pinged them",
  "actionOpen": "Open",
  "actionGhosted": "Mark rejected",
  "moveError": "Couldn't save the change. Try again.",
  "rejectTitle": "Rejection",
  "rejectStage": "Stage",
  "rejectBy": "Who decided",
  "byCompany": "Company",
  "byMe": "Me",
  "rejectReasons": "Reasons",
  "rejectNote": "Note",
  "rejectConfirm": "Save rejection",
  "cancel": "Cancel",
  "stage_application": "Application",
  "stage_screening": "Screening",
  "stage_technical": "Technical interview",
  "stage_test_task": "Test task",
  "stage_final": "Final interview",
  "stage_offer": "Offer",
  "reason_experience_level": "Experience level",
  "reason_stack_mismatch": "Stack mismatch",
  "reason_english": "English",
  "reason_salary_expectations": "Salary expectations",
  "reason_position_closed": "Position closed",
  "reason_other_candidate": "Another candidate",
  "reason_test_task_failed": "Test task failed",
  "reason_tech_interview_failed": "Tech interview failed",
  "reason_location_timezone": "Location / time zone",
  "reason_culture_fit": "Culture fit",
  "reason_no_feedback": "No feedback",
  "reason_my_decision_salary": "My decision: salary",
  "reason_my_decision_company": "My decision: company",
  "reason_other": "Other",
  "close": "Close",
  "openOriginal": "Open the job",
  "moveTo": "Column",
  "gotReply": "They replied",
  "labels": "Labels",
  "newLabel": "New label",
  "labelColor": "Label color",
  "salary": "Salary",
  "nextAction": "Next step (interview, deadline)",
  "contactName": "Recruiter",
  "contactUrl": "Recruiter link",
  "notes": "Notes",
  "save": "Save",
  "saveError": "Check the fields and try again.",
  "delete": "Delete card",
  "deleteConfirm": "Delete this card?",
  "history": "History",
  "event_created": "Card created",
  "event_moved": "Moved",
  "event_note": "Notes updated",
  "event_label": "Labels changed",
  "event_follow_up_sent": "Pinged",
  "event_response": "Reply received",
  "event_outcome": "Outcome set",
  "label_priority": "Priority",
  "label_referral": "Referral",
  "label_via_recruiter": "Via recruiter",
  "label_no_salary": "No salary",
  "label_awaiting_interview": "Awaiting interview"
}
```
`uk.json`:
```json
"board": {
  "title": "Дошка відгуків",
  "empty": "Карток ще немає. Збережіть вакансію зі «Сьогодні» або додайте вручну.",
  "appliedAgo": "відгук {ago}",
  "urgency_interview_soon": "Скоро інтерв'ю",
  "urgency_overdue": "Прострочено",
  "urgency_ghosting": "Ігнорують?",
  "urgency_ping": "Час нагадати",
  "sortToggle": "Перемкнути сортування",
  "sortSmart": "Розумне",
  "sortManual": "Вручну",
  "todayTitle": "{count, plural, one {# дія на сьогодні} few {# дії на сьогодні} many {# дій на сьогодні} other {# дії на сьогодні}}",
  "today_interview": "Інтерв'ю",
  "today_ping": "Нагадати",
  "today_ghosting": "Без відповіді",
  "actionPinged": "Я нагадав",
  "actionOpen": "Відкрити",
  "actionGhosted": "Позначити відмову",
  "moveError": "Не вдалося зберегти зміну. Спробуйте ще раз.",
  "rejectTitle": "Відмова",
  "rejectStage": "Етап",
  "rejectBy": "Хто вирішив",
  "byCompany": "Компанія",
  "byMe": "Я",
  "rejectReasons": "Причини",
  "rejectNote": "Нотатка",
  "rejectConfirm": "Зберегти відмову",
  "cancel": "Скасувати",
  "stage_application": "Відгук",
  "stage_screening": "Скринінг",
  "stage_technical": "Технічне інтерв'ю",
  "stage_test_task": "Тестове",
  "stage_final": "Фінальне інтерв'ю",
  "stage_offer": "Офер",
  "reason_experience_level": "Рівень досвіду",
  "reason_stack_mismatch": "Не той стек",
  "reason_english": "Англійська",
  "reason_salary_expectations": "Зарплатні очікування",
  "reason_position_closed": "Вакансію закрили",
  "reason_other_candidate": "Обрали іншого",
  "reason_test_task_failed": "Не пройшов тестове",
  "reason_tech_interview_failed": "Не пройшов технічне",
  "reason_location_timezone": "Локація / часовий пояс",
  "reason_culture_fit": "Культурна відповідність",
  "reason_no_feedback": "Без відповіді",
  "reason_my_decision_salary": "Моє рішення: зарплата",
  "reason_my_decision_company": "Моє рішення: компанія",
  "reason_other": "Інше",
  "close": "Закрити",
  "openOriginal": "Відкрити вакансію",
  "moveTo": "Колонка",
  "gotReply": "Мені відповіли",
  "labels": "Мітки",
  "newLabel": "Нова мітка",
  "labelColor": "Колір мітки",
  "salary": "Зарплата",
  "nextAction": "Наступний крок (інтерв'ю, дедлайн)",
  "contactName": "Рекрутер",
  "contactUrl": "Посилання на рекрутера",
  "notes": "Нотатки",
  "save": "Зберегти",
  "saveError": "Перевірте поля і спробуйте ще раз.",
  "delete": "Видалити картку",
  "deleteConfirm": "Видалити цю картку?",
  "history": "Історія",
  "event_created": "Картку створено",
  "event_moved": "Переміщено",
  "event_note": "Нотатки оновлено",
  "event_label": "Мітки змінено",
  "event_follow_up_sent": "Нагадав",
  "event_response": "Отримано відповідь",
  "event_outcome": "Встановлено результат",
  "label_priority": "Пріоритет",
  "label_referral": "Реферал",
  "label_via_recruiter": "Через рекрутера",
  "label_no_salary": "Без зарплати",
  "label_awaiting_interview": "Чекаю інтерв'ю"
}
```
`ru.json`:
```json
"board": {
  "title": "Доска откликов",
  "empty": "Карточек пока нет. Сохраните вакансию из «Сегодня» или добавьте вручную.",
  "appliedAgo": "отклик {ago}",
  "urgency_interview_soon": "Скоро интервью",
  "urgency_overdue": "Просрочено",
  "urgency_ghosting": "Игнорируют?",
  "urgency_ping": "Пора напомнить",
  "sortToggle": "Переключить сортировку",
  "sortSmart": "Умная",
  "sortManual": "Вручную",
  "todayTitle": "{count, plural, one {# действие на сегодня} few {# действия на сегодня} many {# действий на сегодня} other {# действия на сегодня}}",
  "today_interview": "Интервью",
  "today_ping": "Напомнить",
  "today_ghosting": "Без ответа",
  "actionPinged": "Я напомнил",
  "actionOpen": "Открыть",
  "actionGhosted": "Отметить отказ",
  "moveError": "Не удалось сохранить изменение. Попробуйте ещё раз.",
  "rejectTitle": "Отказ",
  "rejectStage": "Этап",
  "rejectBy": "Кто решил",
  "byCompany": "Компания",
  "byMe": "Я",
  "rejectReasons": "Причины",
  "rejectNote": "Заметка",
  "rejectConfirm": "Сохранить отказ",
  "cancel": "Отмена",
  "stage_application": "Отклик",
  "stage_screening": "Скрининг",
  "stage_technical": "Техническое интервью",
  "stage_test_task": "Тестовое",
  "stage_final": "Финальное интервью",
  "stage_offer": "Оффер",
  "reason_experience_level": "Уровень опыта",
  "reason_stack_mismatch": "Не тот стек",
  "reason_english": "Английский",
  "reason_salary_expectations": "Зарплатные ожидания",
  "reason_position_closed": "Вакансию закрыли",
  "reason_other_candidate": "Выбрали другого",
  "reason_test_task_failed": "Не прошёл тестовое",
  "reason_tech_interview_failed": "Не прошёл техническое",
  "reason_location_timezone": "Локация / часовой пояс",
  "reason_culture_fit": "Культурное соответствие",
  "reason_no_feedback": "Без ответа",
  "reason_my_decision_salary": "Моё решение: зарплата",
  "reason_my_decision_company": "Моё решение: компания",
  "reason_other": "Другое",
  "close": "Закрыть",
  "openOriginal": "Открыть вакансию",
  "moveTo": "Колонка",
  "gotReply": "Мне ответили",
  "labels": "Метки",
  "newLabel": "Новая метка",
  "labelColor": "Цвет метки",
  "salary": "Зарплата",
  "nextAction": "Следующий шаг (интервью, дедлайн)",
  "contactName": "Рекрутер",
  "contactUrl": "Ссылка на рекрутера",
  "notes": "Заметки",
  "save": "Сохранить",
  "saveError": "Проверьте поля и попробуйте ещё раз.",
  "delete": "Удалить карточку",
  "deleteConfirm": "Удалить эту карточку?",
  "history": "История",
  "event_created": "Карточка создана",
  "event_moved": "Перемещено",
  "event_note": "Заметки обновлены",
  "event_label": "Метки изменены",
  "event_follow_up_sent": "Напомнил",
  "event_response": "Получен ответ",
  "event_outcome": "Установлен итог",
  "label_priority": "Приоритет",
  "label_referral": "Реферал",
  "label_via_recruiter": "Через рекрутера",
  "label_no_salary": "Без зарплаты",
  "label_awaiting_interview": "Жду интервью"
}
```
Строку `comingSoon.board` в messages оставить (тест паритета её покрывает; удалить только если станет неиспользуемой и линт требует — удалить во всех трёх локалях).

- [ ] **Step 6: Unit-тест на порядок рангов при переносе** — не нужен отдельный: логика рангов покрыта в core; поведение доски — E2E.

- [ ] **Step 7: E2E**

`apps/web/e2e/helpers/seed.ts` — добавить импорт `import { rankAtEnd } from '@jp/core';` и функцию (у каждого E2E-пользователя одна карточка на колонку, поэтому ранг `a0` валиден):
```ts
export async function seedApplication(
  email: string,
  opts: { column?: string; title?: string; appliedDaysAgo?: number; nextActionInHours?: number } = {},
) {
  const db = admin();
  const userId = await userIdByEmail(email);
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const title = opts.title ?? `Full Stack Engineer ${tag}`;
  const { data: col, error: cErr } = await db.from('board_columns').select('id').eq('user_id', userId).eq('key', opts.column ?? 'applied').single();
  if (cErr) throw cErr;
  const day = 24 * 3600 * 1000;
  const { data, error } = await db
    .from('applications')
    .insert({
      user_id: userId,
      column_id: col.id,
      rank: rankAtEnd(null),
      title,
      company: `Acme ${tag}`,
      url: `https://jobs.dou.ua/vacancies/${tag}/`,
      applied_at: opts.appliedDaysAgo != null ? new Date(Date.now() - opts.appliedDaysAgo * day).toISOString() : null,
      next_action_at: opts.nextActionInHours != null ? new Date(Date.now() + opts.nextActionInHours * 3600 * 1000).toISOString() : null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return { id: data.id, title };
}
```

`apps/web/e2e/board.spec.ts`:
```ts
import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedApplication } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });
const card = (page: Page, title: string) => visible(page, 'board-card').filter({ hasText: title });
const column = (page: Page, key: string) => page.locator(`[data-testid="board-column"][data-column-key="${key}"]`);

test('shows the six default columns with counters', async ({ context, page }) => {
  const email = uniqueEmail('board-columns');
  await loginAs(context, email);
  await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await expect(page.getByTestId('board-column')).toHaveCount(6);
  await expect(column(page, 'saved').getByTestId('column-count')).toHaveText('1');
});

test('flags an old application and offers a ping action', async ({ context, page }) => {
  const email = uniqueEmail('board-urgency');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { appliedDaysAgo: 16 });
  await page.goto('/en/board');
  await expect(card(page, title).getByTestId('card-urgency')).toHaveAttribute('data-urgency', 'overdue');
  await expect(column(page, 'applied').getByTestId('column-count')).toContainText('1');
  const action = visible(page, 'today-action').filter({ hasText: title });
  await expect(action).toHaveAttribute('data-kind', 'ping');
  await action.getByRole('button').click();
  await expect(card(page, title).getByTestId('card-urgency')).toHaveCount(0);
});

test('moves a card through the panel and records history', async ({ context, page }) => {
  const email = uniqueEmail('board-move');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'panel-move').selectOption({ label: 'Interview' });
  await expect(column(page, 'interview').getByText(title)).toBeVisible();
  await page.reload();
  await expect(column(page, 'interview').getByText(title)).toBeVisible();
  await card(page, title).click();
  await expect(visible(page, 'panel-history')).toContainText('Moved');
});

test('moving to Rejected asks for reasons', async ({ context, page }) => {
  const email = uniqueEmail('board-reject');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 2 });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'panel-move').selectOption({ label: 'Rejected' });
  await expect(visible(page, 'reject-dialog')).toBeVisible();
  await expect(visible(page, 'reject-confirm')).toBeDisabled();
  await visible(page, 'reject-stage').selectOption('technical');
  await page.locator('[data-testid="reject-reason"][value="english"]').check();
  await visible(page, 'reject-confirm').click();
  await expect(column(page, 'rejected').getByText(title)).toBeVisible();
});

test('moving to Offer celebrates', async ({ context, page }) => {
  const email = uniqueEmail('board-offer');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'interview' });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'panel-move').selectOption({ label: 'Offer' });
  await expect(column(page, 'offer').getByText(title)).toBeVisible();
});

test('edits notes and labels in the panel', async ({ context, page }) => {
  const email = uniqueEmail('board-panel');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await card(page, title).click();
  await visible(page, 'panel-notes').fill('Ask about the team size');
  await visible(page, 'panel-save').click();
  await visible(page, 'panel-label').filter({ hasText: 'Priority' }).click();
  await expect(visible(page, 'panel-label').filter({ hasText: 'Priority' })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(card(page, title)).toContainText('Priority');
  await card(page, title).click();
  await expect(visible(page, 'panel-notes')).toHaveValue('Ask about the team size');
});

test('drags a card to another column with the mouse', async ({ context, page, isMobile }) => {
  test.skip(isMobile, 'mouse drag on desktop; touch uses long-press');
  const email = uniqueEmail('board-drag');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  const from = await card(page, title).boundingBox();
  const to = await column(page, 'test_task').boundingBox();
  await page.mouse.move(from!.x + 20, from!.y + 20);
  await page.mouse.down();
  await page.mouse.move(from!.x + 40, from!.y + 30, { steps: 5 });
  await page.mouse.move(to!.x + to!.width / 2, to!.y + 80, { steps: 15 });
  await page.mouse.up();
  await expect(column(page, 'test_task').getByText(title)).toBeVisible();
});
```
В `apps/web/e2e/feed.spec.ts` (тест «saves a match …») после `expect.poll(...)` добавить:
```ts
  await page.goto('/en/board');
  await expect(page.getByTestId('board-card').filter({ visible: true }).filter({ hasText: title })).toBeVisible();
```

- [ ] **Step 8: Проверка и commit**

Run: `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e`
Expected: PASS (оба проекта Playwright). Клики по карточке не должны срабатывать как drag: `PointerSensor` с `distance: 6` это обеспечивает.

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): smart application board — dnd, urgency, today actions, card panel, rejection, offer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Ручная карточка по ссылке (безопасный предпросмотр)

**Files:**
- Create: `apps/web/src/lib/job-preview.ts`, `apps/web/src/lib/job-preview.test.ts`, `apps/web/src/app/[locale]/(app)/board/add-card-dialog.tsx`
- Modify: `apps/web/src/app/[locale]/(app)/board/{actions.ts,board.tsx}`, `apps/web/messages/{en,uk,ru}.json`, `apps/web/e2e/board.spec.ts`

**Interfaces:**
- Consumes: `rankAtTop` (`@jp/core`); `Board` (Task 4).
- Produces:
  - `isPublicIp(ip: string): boolean`, `parseJobPreview(html: string): JobPreview`, `type JobPreview = { title: string | null; company: string | null; location: string | null; salary: string | null }`, `fetchJobPreview(url: string): Promise<JobPreview | null>` (`server-only`).
  - Server actions: `previewJob(url: string): Promise<JobPreview | null>`, `createApplication(input: { columnId: string; title: string; company: string; url: string | null; location: string | null; salary: string | null }): Promise<BoardCard | null>`.
  - Test ids: `add-card`, `add-card-dialog`, `add-url`, `add-fetch`, `add-title`, `add-company`, `add-column`, `add-submit`, `add-preview-failed`.

- [ ] **Step 1: Падающие тесты**

`apps/web/src/lib/job-preview.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { isPublicIp, parseJobPreview } = await import('./job-preview');

describe('isPublicIp', () => {
  it('rejects private, loopback, link-local and unspecified addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', '::', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1']) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it('accepts public addresses', () => {
    for (const ip of ['8.8.8.8', '172.32.0.1', '1.1.1.1', '2a00:1450:4001::200e', '::ffff:8.8.8.8']) {
      expect(isPublicIp(ip), ip).toBe(true);
    }
  });
});

describe('parseJobPreview', () => {
  it('prefers JSON-LD JobPosting', () => {
    const html = `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify({
      '@type': 'JobPosting',
      title: 'Senior Full Stack Developer',
      hiringOrganization: { name: 'Acme' },
      jobLocation: { address: { addressLocality: 'Kyiv' } },
      baseSalary: { currency: 'USD', value: { minValue: 4000, maxValue: 5000, unitText: 'MONTH' } },
    })}</script></head></html>`;
    expect(parseJobPreview(html)).toEqual({ title: 'Senior Full Stack Developer', company: 'Acme', location: 'Kyiv', salary: '4000–5000 USD / MONTH' });
  });
  it('falls back to Open Graph and the title tag', () => {
    const html = '<html><head><meta property="og:title" content="Backend Engineer &amp; Lead"><meta property="og:site_name" content="Globex"><title>ignored</title></head></html>';
    expect(parseJobPreview(html)).toEqual({ title: 'Backend Engineer & Lead', company: 'Globex', location: null, salary: null });
    expect(parseJobPreview('<title> Plain title </title>').title).toBe('Plain title');
  });
});
```
Run: `pnpm --filter @jp/web test` → FAIL.

- [ ] **Step 2: `job-preview.ts`**

```ts
import 'server-only';
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

export type JobPreview = { title: string | null; company: string | null; location: string | null; salary: string | null };

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function ipv4Public(ip: string): boolean {
  const [a = 0, b = 0] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a >= 224) return false; // multicast, reserved
  return true;
}

/** True only for globally routable unicast addresses (blocks SSRF to the host, LAN and cloud metadata). */
export function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Public(ip);
  if (version !== 6) return false;
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Public(mapped[1]!);
  if (lower === '::' || lower === '::1') return false;
  if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith('ff')) return false;
  return true;
}

/** DNS lookup that refuses to connect anywhere non-public: the check runs on the address actually used. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0);
    const list = addresses as unknown as { address: string; family: number }[];
    if (list.length === 0 || !list.every((a) => isPublicIp(a.address))) {
      return callback(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }), '', 0);
    }
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: typeof list) => void)(null, list);
    return callback(null, list[0]!.address, list[0]!.family);
  });
};

function get(url: URL, redirects: number): Promise<string | null> {
  if (!/^https?:$/.test(url.protocol) || (url.port && !['80', '443'].includes(url.port)) || url.username || url.password) {
    return Promise.resolve(null);
  }
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const req = lib.get(
      url,
      { lookup: guardedLookup, timeout: TIMEOUT_MS, headers: { 'user-agent': 'Mozilla/5.0 (compatible; BigOfferBot/1.0)', accept: 'text/html' } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && redirects < MAX_REDIRECTS) {
          res.resume();
          return resolve(get(new URL(res.headers.location, url), redirects + 1));
        }
        if (status !== 200) {
          res.resume();
          return resolve(null);
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            return resolve(Buffer.concat(chunks).toString('utf8'));
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', () => resolve(null));
      },
    );
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

function meta(html: string, prop: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  return m?.[1] ? decode(m[1]) || null : null;
}

type Ld = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function ldSalary(base: unknown): string | null {
  const b = base as { currency?: unknown; value?: { minValue?: unknown; maxValue?: unknown; value?: unknown; unitText?: unknown } } | undefined;
  if (!b?.value) return null;
  const min = b.value.minValue ?? b.value.value;
  const max = b.value.maxValue;
  const range = [min, max].filter((v) => typeof v === 'number' || typeof v === 'string').join('–');
  if (!range) return null;
  return [range, str(b.currency), str(b.value.unitText) ? `/ ${str(b.value.unitText)}` : null].filter(Boolean).join(' ');
}

export function parseJobPreview(html: string): JobPreview {
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    const nodes = (Array.isArray(data) ? data : [data, ...(((data as Ld)?.['@graph'] as unknown[]) ?? [])]) as Ld[];
    const job = nodes.find((n) => n && n['@type'] === 'JobPosting');
    if (!job) continue;
    const loc = (Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation) as { address?: { addressLocality?: unknown; addressCountry?: unknown } } | undefined;
    return {
      title: str(job.title),
      company: str((job.hiringOrganization as Ld | undefined)?.name),
      location: str(loc?.address?.addressLocality) ?? str(loc?.address?.addressCountry),
      salary: ldSalary(job.baseSalary),
    };
  }
  const title = meta(html, 'og:title') ?? (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)![1]!) || null : null);
  return { title, company: meta(html, 'og:site_name'), location: null, salary: null };
}

export async function fetchJobPreview(raw: string): Promise<JobPreview | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const html = await get(url, 0);
  return html ? parseJobPreview(html) : null;
}
```

- [ ] **Step 3: Server actions**

В `board/actions.ts` добавить:
```ts
import { rankAtTop } from '@jp/core';
import { fetchJobPreview, type JobPreview } from '@/lib/job-preview';
import type { BoardCard } from './board-types';

export async function previewJob(url: string): Promise<JobPreview | null> {
  if (!(await getUserId()) || url.length > 2000) return null;
  return fetchJobPreview(url);
}

export async function createApplication(input: {
  columnId: string;
  title: string;
  company: string;
  url: string | null;
  location: string | null;
  salary: string | null;
}): Promise<BoardCard | null> {
  const supabase = await client();
  const userId = await getUserId();
  const title = input.title.trim().slice(0, 300);
  const url = input.url?.trim() || null;
  if (!supabase || !userId || !UUID.test(input.columnId) || !title || (url && !/^https?:\/\//i.test(url))) return null;
  const { data: col } = await supabase.from('board_columns').select('key').eq('id', input.columnId).maybeSingle();
  if (!col) return null;
  const { data: first } = await supabase.from('applications').select('rank').eq('column_id', input.columnId).order('rank').limit(1).maybeSingle();
  const appliedAt = col.key === 'applied' ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      column_id: input.columnId,
      rank: rankAtTop(first?.rank ?? null),
      title,
      company: input.company.trim().slice(0, 200),
      url,
      location: input.location?.trim().slice(0, 200) || null,
      salary: input.salary?.trim().slice(0, 120) || null,
      applied_at: appliedAt,
    })
    .select('id, rank')
    .single();
  if (error || !data) {
    if (error) console.error('createApplication failed', error.message);
    return null;
  }
  await event(supabase, data.id, 'created', { from: 'manual' });
  revalidatePath('/[locale]/board', 'page');
  return {
    id: data.id, columnId: input.columnId, rank: data.rank, title, company: input.company.trim(), url,
    sourceId: null, salary: input.salary?.trim() || null, notes: null, contactName: null, contactUrl: null,
    appliedAt, nextActionAt: null, firstResponseAt: null, lastActivityAt: null, followUpCount: 0, outcome: 'open', labelIds: [],
  };
}
```

- [ ] **Step 4: Диалог**

`board/add-card-dialog.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { createApplication, previewJob } from './actions';
import type { BoardCard, BoardColumn } from './board-types';

export function AddCardDialog({ columns, onCreated, onClose }: { columns: BoardColumn[]; onCreated: (c: BoardCard) => void; onClose: () => void }) {
  const t = useTranslations('board');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [columnId, setColumnId] = useState(columns.find((c) => c.key === 'saved')?.id ?? columns[0]?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState(false);
  const field = 'brutal bg-card px-2 py-1 font-sans text-sm normal-case';

  const fetchPreview = async () => {
    setLoading(true);
    setFailed(false);
    const p = await previewJob(url.trim());
    setLoading(false);
    if (!p || !p.title) return setFailed(true);
    setTitle(p.title);
    if (p.company) setCompany(p.company);
    if (p.location) setLocation(p.location);
    if (p.salary) setSalary(p.salary);
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="add-title-h" data-testid="add-card-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        className="brutal flex w-full max-w-lg flex-col gap-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const card = await createApplication({ columnId, title, company, url: url.trim() || null, location: location || null, salary: salary || null });
          if (!card) return setError(true);
          onCreated(card);
          onClose();
        }}
      >
        <h2 id="add-title-h" className="font-display text-xl font-black">{t('addTitle')}</h2>
        <div className="flex gap-2">
          <input data-testid="add-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t('addUrl')} className={`${field} flex-1`} />
          <button type="button" data-testid="add-fetch" disabled={!url || loading} onClick={fetchPreview} className="brutal brutal-press px-3 text-sm font-semibold disabled:opacity-50">
            {loading ? '…' : t('addFetch')}
          </button>
        </div>
        {failed && <p data-testid="add-preview-failed" className="text-sm text-warning">{t('addPreviewFailed')}</p>}
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('addJobTitle')}<input data-testid="add-title" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('addCompany')}<input data-testid="add-company" maxLength={200} value={company} onChange={(e) => setCompany(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('addLocation')}<input maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">{t('salary')}<input maxLength={120} value={salary} onChange={(e) => setSalary(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('moveTo')}
          <select data-testid="add-column" value={columnId} onChange={(e) => setColumnId(e.target.value)} className={field}>
            {columns.filter((c) => c.kind === 'active').map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-danger">{t('saveError')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 font-semibold">{t('cancel')}</button>
          <button type="submit" data-testid="add-submit" disabled={!title.trim()} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">{t('addSubmit')}</button>
        </div>
      </form>
    </div>
  );
}
```

В `board/board.tsx`: состояние `const [adding, setAdding] = useState(false);`, кнопка над доской (рядом с `TodayActions`, внутри `data-testid="board"`):
```tsx
<button type="button" data-testid="add-card" onClick={() => setAdding(true)} className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">
  + {t('addCard')}
</button>
```
и в конце разметки:
```tsx
{adding && <AddCardDialog columns={columns} onCreated={(c) => setCards((list) => [...list, c])} onClose={() => setAdding(false)} />}
```
(импорт `AddCardDialog` из `./add-card-dialog`).

- [ ] **Step 5: Сообщения** — в объект `board` всех трёх локалей:

en: `"addCard": "Add card"`, `"addTitle": "New card"`, `"addUrl": "Job link (optional)"`, `"addFetch": "Fetch"`, `"addPreviewFailed": "Couldn't read that page — fill in the fields yourself."`, `"addJobTitle": "Job title"`, `"addCompany": "Company"`, `"addLocation": "Location"`, `"addSubmit": "Add to board"`.
uk: `"addCard": "Додати картку"`, `"addTitle": "Нова картка"`, `"addUrl": "Посилання на вакансію (необов'язково)"`, `"addFetch": "Завантажити"`, `"addPreviewFailed": "Не вдалося прочитати сторінку — заповніть поля вручну."`, `"addJobTitle": "Посада"`, `"addCompany": "Компанія"`, `"addLocation": "Локація"`, `"addSubmit": "Додати на дошку"`.
ru: `"addCard": "Добавить карточку"`, `"addTitle": "Новая карточка"`, `"addUrl": "Ссылка на вакансию (необязательно)"`, `"addFetch": "Загрузить"`, `"addPreviewFailed": "Не удалось прочитать страницу — заполните поля вручную."`, `"addJobTitle": "Должность"`, `"addCompany": "Компания"`, `"addLocation": "Локация"`, `"addSubmit": "Добавить на доску"`.

- [ ] **Step 6: E2E** — в `board.spec.ts` добавить:
```ts
test('adds a card manually', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('board-add'));
  await page.goto('/en/board');
  await visible(page, 'add-card').click();
  await visible(page, 'add-title').fill('Fullstack Developer (manual)');
  await visible(page, 'add-company').fill('Initech');
  await visible(page, 'add-submit').click();
  await expect(column(page, 'saved').getByText('Fullstack Developer (manual)')).toBeVisible();
  await page.reload();
  await expect(column(page, 'saved').getByText('Fullstack Developer (manual)')).toBeVisible();
});

test('a blocked preview URL falls back to manual entry', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('board-ssrf'));
  await page.goto('/en/board');
  await visible(page, 'add-card').click();
  await visible(page, 'add-url').fill('http://127.0.0.1:54321/rest/v1/');
  await visible(page, 'add-fetch').click();
  await expect(visible(page, 'add-preview-failed')).toBeVisible();
});
```

- [ ] **Step 7: Проверка и commit**

Run: `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e`
Expected: PASS.

```bash
git add apps/web
git commit -m "feat(web): add board cards by link with an SSRF-safe preview

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Документация и полный прогон

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-roadmap.md`, `README.md`

- [ ] **Step 1:** Роадмап: План 5 → `✅ PR #7`, План 6 → `следующий`. В строку Плана 3 ничего не менять.
- [ ] **Step 2:** README, раздел «Web app»: одна строка — «`/today` — feed (desktop hotkeys J/K/S/H/A/O, mobile swipe), `/board` — application kanban (drag & drop, smart sort, today actions, add a card by link)».
- [ ] **Step 3:** Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → всё PASS.
- [ ] **Step 4: Commit**
```bash
git add docs README.md
git commit -m "docs: plan 5 status and feed/board usage

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
