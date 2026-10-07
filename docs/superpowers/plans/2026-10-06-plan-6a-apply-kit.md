# План 6a — CV, онбординг, банк ответов, набор отклика, сообщения рекрутеру: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Отклик меньше чем за минуту: пользователь загружает CV (PDF), AI разбирает его и предзаполняет профиль поиска и контакты; у каждой вакансии есть «Набор отклика» (требования ✓/✗, red flags, письмо по шаблону, короткое сообщение, ответы на вопросы формы с банком ответов, контакты в один клик, подсказка по зарплате, «Откликнулись?»); на карточке доски — генератор сообщения рекрутеру с записью в историю.

**Architecture:** Новые таблицы `resumes` (+ приватный bucket Storage `resumes/<uid>/…`), `answer_bank`, `letter_templates`, `apply_kits`, `application_messages`. AI-задачи в `@jp/ai` (`parseCv`, `generateApplyKit`, `answerForm`, `recruiterMessage`) работают **только через приватный ключ** (`sensitivity: 'private'`) — без него UI честно показывает «AI недоступен». Детерминированная часть (разбор вопросов формы, сопоставление с банком ответов) — чистые функции в `@jp/core`. Веб вызывает AI из server actions через `lib/ai.ts`; для E2E есть провайдер `AI_PROVIDER=fake` (только вне production).

**Tech Stack:** Next.js 16 server actions, Supabase (Postgres + RLS + Storage), `@google/genai` 2.25.0 (PDF через inlineData), Zod 4, Vitest 5, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` — 5.5 (`resumes`, `letter_templates`, `answer_bank`, `apply_kits`), 5.6 (`application_messages`, `letter_used/letter_kind`), 7.2 (Apply Kit), 7.6 (онбординг, шаги 1–5), 12.2 (приватный ключ), 12.4 («Написать рекрутеру»). Telegram, дайджест, карточки из скриншотов — **План 6b**.

## Global Constraints

- Все Global Constraints Планов 1–5 (TS 6.0.3, `@jp/`, revoke → grant → RLS, только новые миграции, Zod на границах, сообщения en/uk/ru с одинаковыми ключами, коммиты заканчиваются `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; новые зависимости — точные версии, без `minimumReleaseAgeExclude`).
- **Личные данные (CV, письма, ответы, сообщения рекрутеру) — только `sensitivity: 'private'`.** Без `GEMINI_API_KEY_PRIVATE` эти функции недоступны (UI показывает `ai_unavailable`), фолбэка на публичный ключ нет.
- `AI_PROVIDER=fake` разрешён только при `NODE_ENV !== 'production'` (иначе `readAiEnv` бросает); используется в E2E.
- CV: только PDF, ≤ 5 МБ, проверка сигнатуры `%PDF-`; путь в Storage строго `<user_id>/<uuid>.pdf`; bucket приватный, политики `storage.objects` по первой папке = `auth.uid()`. Ссылка на CV в наборе — подписанная, 30 дней.
- Короткое сообщение ≤ 500 символов; LinkedIn connection note ≤ 300; Telegram ≤ 700; InMail ≤ 1900; email ≤ 2000.
- AI никогда не выдумывает опыт, которого нет в CV (явно в промптах); письмо — на языке вакансии, если язык не выбран явно.
- Типовые вопросы формы (`salary`, `start_date`, `english`, `why_looking`, `work_format`) отвечаются из банка **без LLM**, если ответ сохранён.
- Набор отклика генерируется по запросу (кнопка), хранится в `apply_kits` (по одному на пользователя и вакансию) и переиспользуется; предгенерация для score ≥ 70 — вне рамок (стоимость приватного ключа).

## Структура файлов

```
supabase/migrations/20261009000100_apply_kit.sql
supabase/tests/database/007_apply_kit.test.sql
packages/core/src/apply/form-questions.ts(+test)   splitQuestions, BANK_KEYS, matchBankKey
packages/ai/src/types.ts, gemini.ts, env.ts, testing.ts   files[], task tag, 'fake' provider, fakeResponder
packages/ai/src/tasks/parse-cv.ts(+test)          parseCv, ParsedCv, cvToPrompt, searchProfileFromCv
packages/ai/src/tasks/apply-kit.ts(+test)         generateApplyKit, ApplyKit
packages/ai/src/tasks/form-answers.ts(+test)      answerForm
packages/ai/src/tasks/recruiter-message.ts(+test) recruiterMessage, MESSAGE_FORMATS, MESSAGE_LIMITS
apps/web/
  src/lib/ai.ts                                   getLlm(), privateAiAvailable()
  src/lib/cv.ts                                   CV storage helpers (server-only)
  src/app/[locale]/(app)/profile/{cv-section.tsx,cv-actions.ts,answer-bank.tsx,letter-template.tsx,profile-extras-actions.ts}
  src/app/[locale]/(app)/onboarding/page.tsx, onboarding-actions.ts
  src/components/apply-kit/{apply-kit-panel.tsx,actions.ts,contact-chips.tsx}
  src/app/[locale]/(app)/board/{recruiter-message.tsx,message-actions.ts}
  messages/{en,uk,ru}.json, playwright.config.ts, e2e/{cv,apply-kit,recruiter}.spec.ts, e2e/fixtures/cv.pdf
```

---

### Task 1: БД — CV, банк ответов, шаблоны писем, наборы отклика, сообщения

**Files:**
- Create: `supabase/migrations/20261009000100_apply_kit.sql`, `supabase/tests/database/007_apply_kit.test.sql`
- Modify: `packages/db/src/database.types.ts` (регенерация)

**Interfaces:**
- Produces: таблицы `resumes`, `answer_bank`, `letter_templates`, `apply_kits`, `application_messages`; колонки `applications.letter_used`, `applications.letter_kind`; тип события `message`; bucket `resumes` с политиками.

- [ ] **Step 1: Падающий pgTAP**

`supabase/tests/database/007_apply_kit.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select has_table('public', 'resumes', 'resumes exists');
select has_table('public', 'apply_kits', 'apply_kits exists');
select has_table('public', 'application_messages', 'application_messages exists');
select is((select public from storage.buckets where id = 'resumes'), false, 'resumes bucket is private');

insert into auth.users (id, email) values
  ('a6000000-0000-0000-0000-00000000000a', 'kit-a@test.dev'),
  ('a6000000-0000-0000-0000-00000000000b', 'kit-b@test.dev');
insert into public.companies (id, name, normalized_name) values ('c6000000-0000-0000-0000-000000000001', 'Kit Co', 'kit co plan6 test');
insert into public.jobs (id, fingerprint, title, company_id) values ('d6000000-0000-0000-0000-000000000001', 'p6-1', 'Dev', 'c6000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-00000000000a","role":"authenticated"}';

select lives_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000a/cv.pdf', 'cv.pdf') $$, 'own CV row');
select throws_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000b/cv.pdf', 'x.pdf') $$,
  '23514', null, 'CV path must be in the owner folder');
select throws_ok($$ insert into public.resumes (user_id, storage_path, file_name)
  values ('a6000000-0000-0000-0000-00000000000a', 'a6000000-0000-0000-0000-00000000000a/cv2.pdf', 'cv2.pdf') $$,
  '23505', null, 'only one primary CV');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('resumes', 'a6000000-0000-0000-0000-00000000000a/cv.pdf') $$,
  'upload into own folder');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('resumes', 'a6000000-0000-0000-0000-00000000000b/cv.pdf') $$,
  '42501', null, 'cannot upload into another folder');
select lives_ok($$ insert into public.answer_bank (user_id, key, question, answer)
  values ('a6000000-0000-0000-0000-00000000000a', 'salary', 'Salary?', '{"en":"$4000"}') $$, 'answer bank row');
select lives_ok($$ insert into public.apply_kits (user_id, job_id, lang, cover_letter, short_message)
  values ('a6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000001', 'en', 'Dear…', 'Hi') $$, 'apply kit row');
select throws_ok($$ insert into public.apply_kits (user_id, job_id, lang, cover_letter, short_message)
  values ('a6000000-0000-0000-0000-00000000000a', 'd6000000-0000-0000-0000-000000000001', 'en', 'x', repeat('a', 501)) $$,
  '23514', null, 'short message is at most 500 characters');

set local request.jwt.claims = '{"sub":"a6000000-0000-0000-0000-00000000000b","role":"authenticated"}';
select is((select count(*)::int from public.resumes) + (select count(*)::int from public.answer_bank) + (select count(*)::int from public.apply_kits),
  0, 'another user sees none of it');
select is((select count(*)::int from storage.objects where bucket_id = 'resumes'), 0, 'another user cannot list the CV file');

select * from finish();
rollback;
```

Run: `supabase test db` → FAIL (нет таблиц).

- [ ] **Step 2: Миграция**

`supabase/migrations/20261009000100_apply_kit.sql`:
```sql
-- Plan 6a: CV, answer bank, letter templates, apply kits, outgoing recruiter messages (spec 5.5, 5.6, 7.2, 12.4).

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  parsed jsonb,
  parse_error text check (char_length(parse_error) <= 500),
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  constraint resumes_path_owner check (storage_path like user_id::text || '/%')
);
create unique index resumes_one_primary on public.resumes (user_id) where is_primary;

create table public.answer_bank (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  question text not null check (char_length(question) between 1 and 300),
  answer jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  unique (user_id, key)
);
create trigger answer_bank_updated_at before update on public.answer_bank
  for each row execute function public.set_updated_at();

create table public.letter_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  locale text not null check (locale in ('uk', 'ru', 'en')),
  body text not null check (char_length(body) between 1 and 5000),
  updated_at timestamptz not null default now(),
  unique (user_id, locale)
);
create trigger letter_templates_updated_at before update on public.letter_templates
  for each row execute function public.set_updated_at();

create table public.apply_kits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  lang text not null check (lang ~ '^[a-z]{2}$'),
  requirements jsonb not null default '[]',
  red_flags text[] not null default '{}',
  cover_letter text not null check (char_length(cover_letter) <= 6000),
  short_message text not null check (char_length(short_message) <= 500),
  salary_hint text check (char_length(salary_hint) <= 300),
  form_answers jsonb not null default '[]',
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create trigger apply_kits_updated_at before update on public.apply_kits
  for each row execute function public.set_updated_at();

create table public.application_messages (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  channel text not null check (channel in ('email', 'linkedin', 'djinni', 'telegram', 'call', 'other')),
  author text check (char_length(author) <= 200),
  body text not null check (char_length(body) between 1 and 10000),
  sent_at timestamptz not null default now(),
  ai_classification text check (ai_classification in ('rejection', 'interview_invite', 'test_task', 'question', 'offer', 'other')),
  ai_extracted jsonb
);
create index application_messages_app on public.application_messages (application_id, sent_at desc);

alter table public.applications
  add column letter_used text check (char_length(letter_used) <= 6000),
  add column letter_kind text check (letter_kind in ('full', 'short', 'none'));
grant update (letter_used, letter_kind) on public.applications to authenticated;

alter table public.application_events drop constraint application_events_type_check;
alter table public.application_events add constraint application_events_type_check
  check (type in ('created', 'moved', 'note', 'label', 'follow_up_sent', 'response', 'outcome', 'message'));

-- grants
revoke all on public.resumes, public.answer_bank, public.letter_templates, public.apply_kits, public.application_messages
  from anon, authenticated;
grant select, insert, delete on public.resumes to authenticated;
grant update (file_name, parsed, parse_error, is_primary) on public.resumes to authenticated;
grant select, insert, update, delete on public.answer_bank, public.letter_templates to authenticated;
grant select, insert, delete on public.apply_kits to authenticated;
grant update (lang, requirements, red_flags, cover_letter, short_message, salary_hint, form_answers, generated_at)
  on public.apply_kits to authenticated;
grant select, insert, delete on public.application_messages to authenticated;

-- RLS
alter table public.resumes enable row level security;
alter table public.answer_bank enable row level security;
alter table public.letter_templates enable row level security;
alter table public.apply_kits enable row level security;
alter table public.application_messages enable row level security;

create policy "own resumes" on public.resumes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own answers" on public.answer_bank for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own templates" on public.letter_templates for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own kits" on public.apply_kits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own messages" on public.application_messages for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.applications a where a.id = application_id and a.user_id = (select auth.uid()))
  );

-- Private CV bucket: each user owns the folder named after their id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy "own cv files read" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cv files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own cv files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

- [ ] **Step 3: Применить, тесты, типы**

Run: `supabase migration up --local && supabase test db` → PASS (007 — 14). **Не делать `db reset`.**
Run: `pnpm db:types && pnpm typecheck` → PASS.

- [ ] **Step 4: Commit**
```bash
git add supabase packages/db
git commit -m "feat(db): CV storage, answer bank, letter templates, apply kits, recruiter messages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: core + ai — вопросы формы, разбор CV, набор отклика, ответы формы, сообщение рекрутеру, fake-провайдер

**Files:**
- Create: `packages/core/src/apply/form-questions.ts(+test)`, `packages/ai/src/tasks/{parse-cv,apply-kit,form-answers,recruiter-message}.ts` (+ `.test.ts` каждого)
- Modify: `packages/core/src/index.ts`, `packages/ai/src/{types.ts,gemini.ts,env.ts,env.test.ts,testing.ts,index.ts}`

**Interfaces:**
- Produces (`@jp/core`): `splitQuestions(text: string): string[]`; `BANK_KEYS = ['salary','start_date','english','why_looking','work_format'] as const`; `type BankKey`; `matchBankKey(question: string): BankKey | null`.
- Produces (`@jp/ai`):
  - `GenerateJsonRequest` + `files?: LlmImage[]` (любые inline-файлы, напр. PDF) и `task?: string` (метка задачи для логов и fake-провайдера).
  - `AiEnv.AI_PROVIDER: 'gemini' | 'fake'`; `createLlmClient` для `'fake'` возвращает `new FakeLlmClient(fakeResponder, ['public','private'])`; `readAiEnv` бросает, если `fake` при `NODE_ENV === 'production'`.
  - `fakeResponder(req: FakeRequest): unknown` (`@jp/ai/testing`) — канонические ответы по `req.task`.
  - `type ParsedCv = { fullName: string | null; headline: string | null; seniority: Seniority | null; yearsExperience: number | null; skills: string[]; locations: string[]; languages: { language: string; level: string }[]; remotePreference: 'any'|'remote'|'hybrid'|'office'; summary: string | null; experience: { company: string; title: string; start: string | null; end: string | null; highlights: string[] }[]; contacts: { email: string | null; phone: string | null; linkedin: string | null; github: string | null; portfolio: string | null; telegram: string | null } }`; `parseCv(llm, { pdfBase64 }): Promise<ParsedCv>`; `normalizeCv(wire): ParsedCv`; `parsedCvSchema` (Zod для чтения из БД); `cvToPrompt(cv: ParsedCv): string`; `searchProfileFromCv(cv: ParsedCv): { name: string; keywords: string[]; skills: string[]; seniority: Seniority[]; locations: string[]; remoteType: 'any'|'remote'|'hybrid'|'office' }`.
  - `type ApplyKit = { lang: string; requirements: { text: string; status: 'met'|'missing'|'unknown' }[]; redFlags: string[]; coverLetter: string; shortMessage: string; salaryHint: string | null }`; `type KitJob = { title: string; company: string; description: string; salary: string | null }`; `generateApplyKit(llm, { job: KitJob; cv: ParsedCv; template: string | null; lang: 'auto'|'en'|'uk'|'ru'; tone: 'default'|'shorter'|'formal'; salaryMinUsd: number | null }): Promise<ApplyKit>`.
  - `answerForm(llm, { questions: string[]; job: KitJob; cv: ParsedCv; lang: string }): Promise<string[]>` (ответ на каждый вопрос по порядку; пустая строка, если модель не ответила).
  - `MESSAGE_FORMATS = ['linkedin_note','inmail','telegram','email'] as const`, `type MessageFormat`, `MESSAGE_LIMITS: Record<MessageFormat, number>` = `{ linkedin_note: 300, inmail: 1900, telegram: 700, email: 2000 }`; `recruiterMessage(llm, { format; kind: 'intro'|'follow_up'; job: { title: string; company: string; description: string | null }; cv: ParsedCv; recruiterName: string | null; lang: string; tone: 'default'|'shorter'|'formal'; previous: string[] }): Promise<{ subject: string | null; body: string }>`.

- [ ] **Step 1: Падающие тесты core**

`packages/core/src/apply/form-questions.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { matchBankKey, splitQuestions } from './form-questions';

describe('splitQuestions', () => {
  it('splits numbered and question-mark lines, dropping noise', () => {
    const text = `Application form
1. What are your salary expectations?
2) When can you start
- Why are you looking for a new job?
Upload your CV
Rate your English (A1–C2):`;
    expect(splitQuestions(text)).toEqual([
      'What are your salary expectations?',
      'When can you start',
      'Why are you looking for a new job?',
      'Rate your English (A1–C2):',
    ]);
  });
  it('keeps a single question as is and caps at 20', () => {
    expect(splitQuestions('Do you have Kubernetes experience?')).toEqual(['Do you have Kubernetes experience?']);
    expect(splitQuestions(Array.from({ length: 30 }, (_, i) => `Q${i}?`).join('\n'))).toHaveLength(20);
  });
});

describe('matchBankKey', () => {
  it('recognizes typical questions in en/uk/ru', () => {
    expect(matchBankKey('What are your salary expectations?')).toBe('salary');
    expect(matchBankKey('Які ваші зарплатні очікування?')).toBe('salary');
    expect(matchBankKey('Когда вы готовы приступить?')).toBe('start_date');
    expect(matchBankKey('When can you start')).toBe('start_date');
    expect(matchBankKey('Rate your English (A1–C2):')).toBe('english');
    expect(matchBankKey('Рівень англійської')).toBe('english');
    expect(matchBankKey('Why are you looking for a new job?')).toBe('why_looking');
    expect(matchBankKey('Remote or office?')).toBe('work_format');
    expect(matchBankKey('Do you have Kubernetes experience?')).toBeNull();
  });
});
```

`packages/core/src/apply/form-questions.ts`:
```ts
export const BANK_KEYS = ['salary', 'start_date', 'english', 'why_looking', 'work_format'] as const;
export type BankKey = (typeof BANK_KEYS)[number];

const MAX_QUESTIONS = 20;
const LEADER = /^\s*(?:\d+[.)]|[-*•])\s*/;

/** Questions from a pasted application form: numbered/bulleted lines, lines ending in "?" or ":". */
export function splitQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1) return [lines[0]!.replace(LEADER, '').slice(0, 300)];
  const out: string[] = [];
  for (const line of lines) {
    const listed = LEADER.test(line);
    const q = line.replace(LEADER, '').trim();
    if (!q || q.length > 300) continue;
    if (listed || /[?:]$/.test(q)) out.push(q);
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

const PATTERNS: [BankKey, RegExp][] = [
  ['salary', /salary|compensation|rate expectation|зарплат|заробітн|оплат|вилк|вилоч|ставк/i],
  ['start_date', /when can you start|start date|notice period|available to start|приступ|почат(?:и|ок) робот|вийти на робот|выйти на работ|готов(?:і|ы)? (?:почати|начать)/i],
  ['english', /english|англ/i],
  ['why_looking', /why .*(?:looking|leav|chang)|reason for (?:leaving|change)|чому .*(?:шука|зміню|йде)|почему .*(?:ищ|меня|уход)/i],
  ['work_format', /remote|office|hybrid|on-?site|віддален|дистанц|удал[её]н|офіс|офис|гібрид|гибрид|формат роботи|формат работы/i],
];

/** The answer-bank key a typical form question maps to, or null when it needs a tailored answer. */
export function matchBankKey(question: string): BankKey | null {
  return PATTERNS.find(([, re]) => re.test(question))?.[0] ?? null;
}
```
В `packages/core/src/index.ts`: `export * from './apply/form-questions';`

Run: `pnpm --filter @jp/core test` → PASS.

- [ ] **Step 2: AI-инфраструктура (files, task, fake)**

`packages/ai/src/types.ts` — в `GenerateJsonRequest` добавить:
```ts
  /** Inline files sent with the prompt (e.g. a PDF CV). */
  files?: LlmImage[];
  /** Task label for logs and the fake provider. */
  task?: string;
```
`packages/ai/src/gemini.ts` — в сборке `parts` добавить файлы перед изображениями:
```ts
      const parts: Part[] = [
        ...[...(req.files ?? []), ...(req.images ?? [])].map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.dataBase64 } })),
        { text: req.prompt },
      ];
```
`packages/ai/src/env.ts`:
```ts
import { FakeLlmClient, fakeResponder } from './testing';
```
```ts
const aiEnvSchema = z.object({
  AI_PROVIDER: z.enum(['gemini', 'fake']).default('gemini'),
  // …остальные поля без изменений
});
```
в `readAiEnv` после parse:
```ts
  const env = aiEnvSchema.parse({ /* как сейчас */ });
  if (env.AI_PROVIDER === 'fake' && (process.env.NODE_ENV === 'production')) {
    throw new Error('AI_PROVIDER=fake is not allowed in production');
  }
  return env;
```
в `createLlmClient`:
```ts
    case 'fake':
      return new FakeLlmClient(fakeResponder, ['public', 'private']);
```
`packages/ai/src/env.test.ts` — добавить:
```ts
  it('allows the fake provider outside production only', () => {
    expect(createLlmClient(readAiEnv({ AI_PROVIDER: 'fake' })).isAvailable('private')).toBe(true);
    const prev = process.env.NODE_ENV;
    try {
      (process.env as Record<string, string>).NODE_ENV = 'production';
      expect(() => readAiEnv({ AI_PROVIDER: 'fake' })).toThrow();
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV = prev;
    }
  });
```
`packages/ai/src/testing.ts` — добавить (после класса):
```ts
/** Canned, schema-valid outputs per task for E2E runs (AI_PROVIDER=fake). Never used in production. */
export function fakeResponder(req: FakeRequest): unknown {
  switch (req.task) {
    case 'parse_cv':
      return {
        full_name: 'Test User',
        headline: 'Full Stack Developer',
        seniority: 'senior',
        years_experience: 6,
        skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
        locations: ['Kyiv'],
        languages: [{ language: 'English', level: 'B2' }],
        remote_preference: 'remote',
        summary: 'Full stack developer building web products.',
        experience: [{ company: 'Acme', title: 'Senior Developer', start: '2021', end: null, highlights: ['Built the payments platform'] }],
        contacts: { email: 'test.user@example.com', phone: null, linkedin: 'https://www.linkedin.com/in/test-user', github: null, portfolio: null, telegram: null },
      };
    case 'apply_kit':
      return {
        lang: 'en',
        requirements: [
          { text: 'React', status: 'met' },
          { text: 'Kubernetes', status: 'missing' },
        ],
        red_flags: ['Unpaid trial period'],
        cover_letter: 'Hello! I am a full stack developer with six years of React and Node.js. [fake]',
        short_message: 'Hi! Senior full stack dev, React/Node, 6 years. Happy to talk. [fake]',
        salary_hint: 'Ask for $4000–4500 per month. [fake]',
      };
    case 'form_answers': {
      const count = [...req.prompt.matchAll(/^#(\d+) /gm)].length;
      return { items: Array.from({ length: count }, (_, i) => ({ n: i + 1, answer: `Fake answer ${i + 1}` })) };
    }
    case 'recruiter_message':
      return { subject: null, body: 'Hi! I saw your opening and would love to connect. [fake]' };
    default:
      throw new Error(`fakeResponder: unknown task ${req.task ?? '(none)'}`);
  }
}
```

- [ ] **Step 3: Разбор CV**

`packages/ai/src/tasks/parse-cv.ts`:
```ts
import { SENIORITIES, type Seniority } from '@jp/core';
import { z } from 'zod';
import type { LlmClient } from '../types';

const nullableText = z.string().nullable();

export const cvWireSchema = z.object({
  full_name: nullableText,
  headline: nullableText.describe('Main role in English, e.g. "Full Stack Developer"'),
  seniority: z.enum(SENIORITIES).nullable(),
  years_experience: z.number().nullable(),
  skills: z.array(z.string()).describe('Up to 30 concrete skills/tools, canonical names'),
  locations: z.array(z.string()).describe('Cities/countries the candidate lives in or wants to work in'),
  languages: z.array(z.object({ language: z.string(), level: z.string() })),
  remote_preference: z.enum(['any', 'remote', 'hybrid', 'office']),
  summary: nullableText.describe('Two sentences in English'),
  experience: z.array(
    z.object({ company: z.string(), title: z.string(), start: nullableText, end: nullableText, highlights: z.array(z.string()) }),
  ),
  contacts: z.object({ email: nullableText, phone: nullableText, linkedin: nullableText, github: nullableText, portfolio: nullableText, telegram: nullableText }),
});

const contact = z.object({
  email: z.email().nullable(),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/).nullable(),
  linkedin: z.url({ protocol: /^https?$/ }).nullable(),
  github: z.url({ protocol: /^https?$/ }).nullable(),
  portfolio: z.url({ protocol: /^https?$/ }).nullable(),
  telegram: z.string().regex(/^@?[A-Za-z0-9_]{5,32}$/).nullable(),
});

/** Validated shape stored in resumes.parsed (also used to read it back). */
export const parsedCvSchema = z.object({
  fullName: z.string().nullable(),
  headline: z.string().nullable(),
  seniority: z.enum(SENIORITIES).nullable(),
  yearsExperience: z.number().nullable(),
  skills: z.array(z.string()),
  locations: z.array(z.string()),
  languages: z.array(z.object({ language: z.string(), level: z.string() })),
  remotePreference: z.enum(['any', 'remote', 'hybrid', 'office']),
  summary: z.string().nullable(),
  experience: z.array(z.object({ company: z.string(), title: z.string(), start: z.string().nullable(), end: z.string().nullable(), highlights: z.array(z.string()) })),
  contacts: contact,
});
export type ParsedCv = z.infer<typeof parsedCvSchema>;

const clip = (s: string | null, n: number) => {
  const t = s?.trim() ?? '';
  return t ? t.slice(0, n) : null;
};
function dedupe(values: string[], max: number, len: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t || t.length > len || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}
const valid = <T>(schema: z.ZodType<T>, v: unknown): T | null => {
  const r = schema.safeParse(v);
  return r.success ? r.data : null;
};

export function normalizeCv(w: z.output<typeof cvWireSchema>): ParsedCv {
  const years = w.years_experience != null && w.years_experience >= 0 && w.years_experience <= 60 ? Math.round(w.years_experience) : null;
  return {
    fullName: clip(w.full_name, 120),
    headline: clip(w.headline, 80),
    seniority: w.seniority,
    yearsExperience: years,
    skills: dedupe(w.skills, 30, 40),
    locations: dedupe(w.locations, 10, 60),
    languages: w.languages.slice(0, 8).map((l) => ({ language: l.language.trim().slice(0, 40), level: l.level.trim().slice(0, 20) })).filter((l) => l.language),
    remotePreference: w.remote_preference,
    summary: clip(w.summary, 400),
    experience: w.experience.slice(0, 8).map((e) => ({
      company: e.company.trim().slice(0, 120),
      title: e.title.trim().slice(0, 120),
      start: clip(e.start, 20),
      end: clip(e.end, 20),
      highlights: dedupe(e.highlights, 4, 200),
    })),
    contacts: {
      email: valid(z.email(), w.contacts.email?.trim()),
      phone: valid(contact.shape.phone.unwrap(), w.contacts.phone?.trim()),
      linkedin: valid(z.url({ protocol: /^https?$/ }), w.contacts.linkedin?.trim()),
      github: valid(z.url({ protocol: /^https?$/ }), w.contacts.github?.trim()),
      portfolio: valid(z.url({ protocol: /^https?$/ }), w.contacts.portfolio?.trim()),
      telegram: valid(contact.shape.telegram.unwrap(), w.contacts.telegram?.trim()),
    },
  };
}

const SYSTEM = [
  'You read one CV (PDF) and extract structured facts for a job search app.',
  'Use only what the CV states. Never invent employers, dates, skills or contacts.',
  'Skills: concrete technologies, tools and professional skills, canonical names.',
].join('\n');

export async function parseCv(llm: LlmClient, input: { pdfBase64: string }): Promise<ParsedCv> {
  const res = await llm.generateJson({
    sensitivity: 'private',
    task: 'parse_cv',
    schema: cvWireSchema,
    system: SYSTEM,
    prompt: 'Extract the facts from the attached CV.',
    files: [{ mimeType: 'application/pdf', dataBase64: input.pdfBase64 }],
    maxOutputTokens: 4000,
  });
  return normalizeCv(res.data);
}

/** Compact CV text for other prompts (private only). */
export function cvToPrompt(cv: ParsedCv): string {
  const lines = [
    `Role: ${cv.headline ?? 'n/a'}${cv.seniority ? ` (${cv.seniority})` : ''}${cv.yearsExperience != null ? `, ${cv.yearsExperience} years` : ''}`,
    `Skills: ${cv.skills.join(', ') || 'n/a'}`,
    `Languages: ${cv.languages.map((l) => `${l.language} ${l.level}`).join(', ') || 'n/a'}`,
    `Location: ${cv.locations.join(', ') || 'n/a'}; prefers ${cv.remotePreference}`,
    `Summary: ${cv.summary ?? 'n/a'}`,
    'Experience:',
    ...cv.experience.map((e) => `- ${e.title} at ${e.company} (${e.start ?? '?'}–${e.end ?? 'now'}): ${e.highlights.join('; ')}`),
  ];
  return lines.join('\n').slice(0, 4000);
}

export function searchProfileFromCv(cv: ParsedCv) {
  const role = cv.headline ?? 'Developer';
  return {
    name: role.slice(0, 80),
    keywords: [role.toLowerCase().slice(0, 60)],
    skills: cv.skills.slice(0, 15),
    seniority: (cv.seniority ? [cv.seniority] : []) as Seniority[],
    locations: cv.locations.slice(0, 10).map((l) => l.slice(0, 60)),
    remoteType: cv.remotePreference,
  };
}
```

`packages/ai/src/tasks/parse-cv.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { cvToPrompt, normalizeCv, parseCv, searchProfileFromCv } from './parse-cv';

describe('parseCv', () => {
  it('sends the PDF with the private key and normalizes the result', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const cv = await parseCv(llm, { pdfBase64: 'JVBERi0=' });
    expect(llm.calls[0]).toMatchObject({ sensitivity: 'private', task: 'parse_cv', files: [{ mimeType: 'application/pdf', dataBase64: 'JVBERi0=' }] });
    expect(cv.headline).toBe('Full Stack Developer');
    expect(cv.contacts.linkedin).toBe('https://www.linkedin.com/in/test-user');
  });

  it('refuses without a private key', async () => {
    await expect(parseCv(new FakeLlmClient(fakeResponder, ['public']), { pdfBase64: 'x' })).rejects.toThrow(/private/);
  });

  it('drops invalid contacts and caps lists', () => {
    const w = fakeResponder({ task: 'parse_cv' } as never) as Parameters<typeof normalizeCv>[0];
    const cv = normalizeCv({ ...w, skills: Array.from({ length: 40 }, (_, i) => `S${i}`), contacts: { ...w.contacts, email: 'nope', github: 'javascript:alert(1)' } });
    expect(cv.skills).toHaveLength(30);
    expect(cv.contacts.email).toBeNull();
    expect(cv.contacts.github).toBeNull();
  });

  it('builds prompt text and a search profile', () => {
    const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
    expect(cvToPrompt(cv)).toContain('Senior Developer at Acme');
    expect(searchProfileFromCv(cv)).toEqual({
      name: 'Full Stack Developer',
      keywords: ['full stack developer'],
      skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL'],
      seniority: ['senior'],
      locations: ['Kyiv'],
      remoteType: 'remote',
    });
  });
});
```

- [ ] **Step 4: Набор отклика**

`packages/ai/src/tasks/apply-kit.ts`:
```ts
import { z } from 'zod';
import type { LlmClient } from '../types';
import { cvToPrompt, type ParsedCv } from './parse-cv';

export const applyKitWireSchema = z.object({
  lang: z.string().describe('ISO 639-1 code of the language you wrote the letter in'),
  requirements: z.array(z.object({ text: z.string(), status: z.enum(['met', 'missing', 'unknown']) })),
  red_flags: z.array(z.string()),
  cover_letter: z.string(),
  short_message: z.string(),
  salary_hint: z.string().nullable(),
});

export type ApplyKit = {
  lang: string;
  requirements: { text: string; status: 'met' | 'missing' | 'unknown' }[];
  redFlags: string[];
  coverLetter: string;
  shortMessage: string;
  salaryHint: string | null;
};
export type KitJob = { title: string; company: string; description: string; salary: string | null };

const LANG_NAME: Record<string, string> = { en: 'English', uk: 'Ukrainian', ru: 'Russian' };

function system(lang: 'auto' | 'en' | 'uk' | 'ru', tone: 'default' | 'shorter' | 'formal'): string {
  return [
    'You help a candidate apply to one job. Use ONLY facts from the candidate CV; never invent experience, employers, numbers or skills.',
    lang === 'auto' ? 'Write the letter and the short message in the language of the job posting.' : `Write the letter and the short message in ${LANG_NAME[lang]}.`,
    'Cover letter: if a template is given, keep it verbatim and replace only the [...] placeholders with specific lines about this job; otherwise write 120–180 words.',
    tone === 'shorter' ? 'Make the letter noticeably shorter (≤ 90 words).' : tone === 'formal' ? 'Use a formal tone.' : 'Friendly professional tone.',
    'Short message: at most 450 characters, for a recruiter chat (Djinni, LinkedIn, Telegram).',
    'Requirements: up to 10 must-haves from the job, each marked met / missing / unknown against the CV.',
    'Red flags: up to 5 concrete concerns stated in the posting (unpaid trial, 6-day week, unclear salary, etc.); empty if none.',
    'Salary hint: one sentence using the job salary (if any) and the candidate minimum; null if nothing to say.',
  ].join('\n');
}

export async function generateApplyKit(
  llm: LlmClient,
  input: { job: KitJob; cv: ParsedCv; template: string | null; lang: 'auto' | 'en' | 'uk' | 'ru'; tone: 'default' | 'shorter' | 'formal'; salaryMinUsd: number | null },
): Promise<ApplyKit> {
  const prompt = [
    `Job: ${input.job.title} at ${input.job.company}`,
    `Job salary: ${input.job.salary ?? 'not stated'}`,
    `Candidate minimum: ${input.salaryMinUsd ? `$${input.salaryMinUsd}/month` : 'not set'}`,
    'Job description:',
    input.job.description.slice(0, 6000),
    '',
    'Candidate CV:',
    cvToPrompt(input.cv),
    '',
    input.template ? `Letter template:\n${input.template.slice(0, 3000)}` : 'No letter template.',
  ].join('\n');
  const res = await llm.generateJson({
    sensitivity: 'private',
    task: 'apply_kit',
    schema: applyKitWireSchema,
    system: system(input.lang, input.tone),
    prompt,
    maxOutputTokens: 2500,
  });
  const w = res.data;
  const lang = /^[a-z]{2}$/.test(w.lang.trim().toLowerCase()) ? w.lang.trim().toLowerCase() : input.lang === 'auto' ? 'en' : input.lang;
  return {
    lang,
    requirements: w.requirements.slice(0, 10).map((r) => ({ text: r.text.trim().slice(0, 200), status: r.status })).filter((r) => r.text),
    redFlags: w.red_flags.map((f) => f.trim().slice(0, 200)).filter(Boolean).slice(0, 5),
    coverLetter: w.cover_letter.trim().slice(0, 6000),
    shortMessage: w.short_message.trim().slice(0, 500),
    salaryHint: w.salary_hint?.trim().slice(0, 300) || null,
  };
}
```

`packages/ai/src/tasks/apply-kit.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { generateApplyKit } from './apply-kit';
import { normalizeCv } from './parse-cv';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const job = { title: 'Senior Full Stack', company: 'Acme', description: 'React, Node.js, Kubernetes. ' + 'x'.repeat(10_000), salary: '$4000–5000' };

describe('generateApplyKit', () => {
  it('uses the private key, sends CV facts and the template, caps the job text', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    const kit = await generateApplyKit(llm, { job, cv, template: 'Hi! [why this job]', lang: 'auto', tone: 'default', salaryMinUsd: 4000 });
    const req = llm.calls[0]!;
    expect(req).toMatchObject({ sensitivity: 'private', task: 'apply_kit' });
    expect(req.prompt).toContain('Senior Developer at Acme');
    expect(req.prompt).toContain('Hi! [why this job]');
    expect(req.prompt.length).toBeLessThan(12_000);
    expect(kit.requirements).toEqual([{ text: 'React', status: 'met' }, { text: 'Kubernetes', status: 'missing' }]);
    expect(kit.shortMessage.length).toBeLessThanOrEqual(500);
  });

  it('asks for the chosen language and tone', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await generateApplyKit(llm, { job, cv, template: null, lang: 'uk', tone: 'shorter', salaryMinUsd: null });
    expect(llm.calls[0]!.system).toContain('Ukrainian');
    expect(llm.calls[0]!.system).toContain('shorter');
  });

  it('truncates an over-long short message', async () => {
    const llm = new FakeLlmClient(() => ({ ...(fakeResponder({ task: 'apply_kit' } as never) as object), short_message: 'x'.repeat(800) }), ['private']);
    const kit = await generateApplyKit(llm, { job, cv, template: null, lang: 'en', tone: 'default', salaryMinUsd: null });
    expect(kit.shortMessage).toHaveLength(500);
  });
});
```

- [ ] **Step 5: Ответы на вопросы формы**

`packages/ai/src/tasks/form-answers.ts`:
```ts
import { z } from 'zod';
import type { LlmClient } from '../types';
import type { KitJob } from './apply-kit';
import { cvToPrompt, type ParsedCv } from './parse-cv';

const wire = z.object({ items: z.array(z.object({ n: z.number(), answer: z.string() })) });

/** Tailored answers to application-form questions, in order (empty string when the model skipped one). */
export async function answerForm(
  llm: LlmClient,
  input: { questions: string[]; job: KitJob; cv: ParsedCv; lang: string },
): Promise<string[]> {
  if (input.questions.length === 0) return [];
  const res = await llm.generateJson({
    sensitivity: 'private',
    task: 'form_answers',
    schema: wire,
    system: [
      'You answer application-form questions for a candidate, in first person.',
      `Answer in the language code "${input.lang}". 1–3 sentences each, concrete, honest.`,
      'Use only facts from the CV; if the CV does not say, answer briefly and honestly without inventing.',
      'Return an item for every question number.',
    ].join('\n'),
    prompt: [
      `Job: ${input.job.title} at ${input.job.company}`,
      input.job.description.slice(0, 3000),
      '',
      'Candidate CV:',
      cvToPrompt(input.cv),
      '',
      'Questions:',
      ...input.questions.map((q, i) => `#${i + 1} ${q}`),
    ].join('\n'),
    maxOutputTokens: 2000,
  });
  const byN = new Map(res.data.items.map((i) => [i.n, i.answer.trim().slice(0, 1500)]));
  return input.questions.map((_, i) => byN.get(i + 1) ?? '');
}
```

`packages/ai/src/tasks/form-answers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { answerForm } from './form-answers';
import { normalizeCv } from './parse-cv';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const job = { title: 'Dev', company: 'Acme', description: 'React', salary: null };

describe('answerForm', () => {
  it('answers every question in order via the private key', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    expect(await answerForm(llm, { questions: ['Kubernetes?', 'Team size?'], job, cv, lang: 'en' })).toEqual(['Fake answer 1', 'Fake answer 2']);
    expect(llm.calls[0]).toMatchObject({ sensitivity: 'private', task: 'form_answers' });
  });
  it('makes no call without questions and fills gaps with empty strings', async () => {
    const none = new FakeLlmClient(fakeResponder, ['private']);
    expect(await answerForm(none, { questions: [], job, cv, lang: 'en' })).toEqual([]);
    expect(none.calls).toHaveLength(0);
    const partial = new FakeLlmClient(() => ({ items: [{ n: 2, answer: 'B' }] }), ['private']);
    expect(await answerForm(partial, { questions: ['a?', 'b?'], job, cv, lang: 'en' })).toEqual(['', 'B']);
  });
});
```

- [ ] **Step 6: Сообщение рекрутеру**

`packages/ai/src/tasks/recruiter-message.ts`:
```ts
import { z } from 'zod';
import type { LlmClient } from '../types';
import { cvToPrompt, type ParsedCv } from './parse-cv';

export const MESSAGE_FORMATS = ['linkedin_note', 'inmail', 'telegram', 'email'] as const;
export type MessageFormat = (typeof MESSAGE_FORMATS)[number];
export const MESSAGE_LIMITS: Record<MessageFormat, number> = { linkedin_note: 300, inmail: 1900, telegram: 700, email: 2000 };

const wire = z.object({ subject: z.string().nullable(), body: z.string() });
const LANG_NAME: Record<string, string> = { en: 'English', uk: 'Ukrainian', ru: 'Russian' };
const FORMAT_HINT: Record<MessageFormat, string> = {
  linkedin_note: 'a LinkedIn connection note (no subject)',
  inmail: 'a LinkedIn InMail with a short subject',
  telegram: 'a Telegram message (no subject, conversational)',
  email: 'an email with a subject line',
};

export async function recruiterMessage(
  llm: LlmClient,
  input: {
    format: MessageFormat;
    kind: 'intro' | 'follow_up';
    job: { title: string; company: string; description: string | null };
    cv: ParsedCv;
    recruiterName: string | null;
    lang: string;
    tone: 'default' | 'shorter' | 'formal';
    previous: string[];
  },
): Promise<{ subject: string | null; body: string }> {
  const limit = MESSAGE_LIMITS[input.format];
  const res = await llm.generateJson({
    sensitivity: 'private',
    task: 'recruiter_message',
    schema: wire,
    system: [
      `Write ${FORMAT_HINT[input.format]} from a candidate to a recruiter, in ${LANG_NAME[input.lang] ?? 'English'}.`,
      input.kind === 'follow_up'
        ? 'It is a polite follow-up: reference the earlier message briefly, add one new relevant point, ask about next steps.'
        : 'It is a first message: who the candidate is, one or two concrete matches with the job, a clear ask.',
      `Hard limit: ${limit} characters for the body. ${input.tone === 'shorter' ? 'Be very brief.' : input.tone === 'formal' ? 'Formal tone.' : 'Friendly professional tone.'}`,
      'Use only facts from the CV. No placeholders like [Name] — if the recruiter name is unknown, use a neutral greeting.',
    ].join('\n'),
    prompt: [
      `Job: ${input.job.title} at ${input.job.company}`,
      input.job.description ? input.job.description.slice(0, 2500) : '',
      `Recruiter: ${input.recruiterName ?? 'unknown'}`,
      '',
      'Candidate CV:',
      cvToPrompt(input.cv),
      ...(input.previous.length ? ['', 'Earlier messages from the candidate:', ...input.previous.slice(-3).map((p) => `- ${p.slice(0, 600)}`)] : []),
    ].join('\n'),
    maxOutputTokens: 1200,
  });
  const hasSubject = input.format === 'inmail' || input.format === 'email';
  return { subject: hasSubject ? res.data.subject?.trim().slice(0, 150) || null : null, body: res.data.body.trim().slice(0, limit) };
}
```

`packages/ai/src/tasks/recruiter-message.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeResponder } from '../testing';
import { normalizeCv } from './parse-cv';
import { MESSAGE_LIMITS, recruiterMessage } from './recruiter-message';

const cv = normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never);
const base = { kind: 'intro' as const, job: { title: 'Dev', company: 'Acme', description: null }, cv, recruiterName: 'Anna', lang: 'uk', tone: 'default' as const, previous: [] };

describe('recruiterMessage', () => {
  it('caps the body at the format limit and drops a subject for chat formats', async () => {
    const llm = new FakeLlmClient(() => ({ subject: 'Hello', body: 'x'.repeat(1000) }), ['private']);
    const note = await recruiterMessage(llm, { ...base, format: 'linkedin_note' });
    expect(note.body).toHaveLength(MESSAGE_LIMITS.linkedin_note);
    expect(note.subject).toBeNull();
    const mail = await recruiterMessage(llm, { ...base, format: 'email' });
    expect(mail.subject).toBe('Hello');
    expect(llm.calls[0]!.system).toContain('Ukrainian');
  });
  it('includes earlier messages for a follow-up', async () => {
    const llm = new FakeLlmClient(fakeResponder, ['private']);
    await recruiterMessage(llm, { ...base, format: 'telegram', kind: 'follow_up', previous: ['First ping'] });
    expect(llm.calls[0]!.prompt).toContain('First ping');
    expect(llm.calls[0]!.system).toContain('follow-up');
  });
});
```

В `packages/ai/src/index.ts`:
```ts
export * from './tasks/parse-cv';
export * from './tasks/apply-kit';
export * from './tasks/form-answers';
export * from './tasks/recruiter-message';
```

- [ ] **Step 7: Проверка и commit**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/ai test && pnpm typecheck` → PASS.
```bash
git add packages
git commit -m "feat(ai): CV parsing, apply kit, form answers, recruiter messages (private key) and a fake provider

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Веб — AI-подключение, загрузка и разбор CV, профиль поиска и контакты из CV

**Files:**
- Create: `apps/web/src/lib/ai.ts`, `apps/web/src/lib/cv.ts`, `apps/web/src/app/[locale]/(app)/profile/{cv-section.tsx,cv-actions.ts}`, `apps/web/e2e/cv.spec.ts`, `apps/web/e2e/fixtures/cv.pdf`
- Modify: `apps/web/package.json` (`@jp/ai`), `apps/web/next.config.ts` (`transpilePackages`), `apps/web/.env.example`, `apps/web/playwright.config.ts` (`webServer.env.AI_PROVIDER = 'fake'`), `apps/web/src/app/[locale]/(app)/profile/page.tsx`, `apps/web/messages/{en,uk,ru}.json`, `README.md`

**Interfaces:**
- Consumes: `parseCv`, `parsedCvSchema`, `searchProfileFromCv`, `createLlmClient`, `readAiEnv`, `LlmError` (`@jp/ai`); таблица `resumes`, bucket `resumes` (Task 1).
- Produces:
  - `lib/ai.ts` (`server-only`): `getLlm(): LlmClient`; `privateAiAvailable(): boolean`.
  - `lib/cv.ts` (`server-only`): `loadPrimaryCv(supabase): Promise<{ id: string; path: string; fileName: string; parsed: ParsedCv | null; parseError: string | null } | null>`; `cvSignedUrl(supabase, path: string): Promise<string | null>` (30 дней).
  - Server actions (`profile/cv-actions.ts`): `uploadCv(prev: CvState, formData: FormData): Promise<CvState>` где `type CvState = { status: 'idle' | 'parsed' | 'stored' | 'invalid' | 'error'; message?: 'not_pdf' | 'too_big' | 'ai_unavailable' | 'parse_failed' }`; `createSearchProfileFromCv(): Promise<void>` (redirect на `/search`); `fillContactsFromCv(): Promise<boolean>` (заполняет только пустые контакты).
  - Test ids: `cv-section`, `cv-file`, `cv-upload`, `cv-status`, `cv-headline`, `cv-skill`, `cv-create-search`, `cv-fill-contacts`, `cv-link`.

- [ ] **Step 1: Подключение**

`apps/web/package.json` → `dependencies`: `"@jp/ai": "workspace:*"`; `next.config.ts`: `transpilePackages: ['@jp/core', '@jp/db', '@jp/ai']`; `pnpm install`.

`apps/web/.env.example` — добавить:
```
# AI for personal data (CV, letters, recruiter messages): PAID Gemini key with no training on data.
# Without it these features show "AI unavailable". Never put the free key here.
GEMINI_API_KEY_PRIVATE=
AI_MODEL_PRIVATE=
```
`playwright.config.ts` → в `webServer` добавить `env: { AI_PROVIDER: 'fake' }` (E2E никогда не ходит в настоящий AI).

`apps/web/src/lib/ai.ts`:
```ts
import 'server-only';
import { createLlmClient, type LlmClient, readAiEnv } from '@jp/ai';

let client: LlmClient | undefined;

/** The app's LLM client (keys from env). Personal data must always use sensitivity 'private'. */
export function getLlm(): LlmClient {
  client ??= createLlmClient(readAiEnv());
  return client;
}

export function privateAiAvailable(): boolean {
  return getLlm().isAvailable('private');
}
```

`apps/web/src/lib/cv.ts`:
```ts
import 'server-only';
import { type ParsedCv, parsedCvSchema } from '@jp/ai';
import type { createClient } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadPrimaryCv(supabase: Supabase) {
  const { data } = await supabase.from('resumes').select('id, storage_path, file_name, parsed, parse_error').eq('is_primary', true).maybeSingle();
  if (!data) return null;
  const parsed = parsedCvSchema.safeParse(data.parsed);
  return {
    id: data.id,
    path: data.storage_path,
    fileName: data.file_name,
    parsed: parsed.success ? (parsed.data as ParsedCv) : null,
    parseError: data.parse_error,
  };
}

const THIRTY_DAYS = 30 * 24 * 3600;

export async function cvSignedUrl(supabase: Supabase, path: string): Promise<string | null> {
  const { data } = await supabase.storage.from('resumes').createSignedUrl(path, THIRTY_DAYS);
  return data?.signedUrl ?? null;
}
```

- [ ] **Step 2: Server actions**

`profile/cv-actions.ts`:
```ts
'use server';

import { parseCv, searchProfileFromCv } from '@jp/ai';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { privateAiAvailable, getLlm } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

export type CvState = { status: 'idle' | 'parsed' | 'stored' | 'invalid' | 'error'; message?: 'not_pdf' | 'too_big' | 'ai_unavailable' | 'parse_failed' };

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadCv(_prev: CvState, formData: FormData): Promise<CvState> {
  const userId = await getUserId();
  const file = formData.get('cv');
  if (!userId) return { status: 'error' };
  if (!(file instanceof File) || file.size === 0) return { status: 'invalid', message: 'not_pdf' };
  if (file.size > MAX_BYTES) return { status: 'invalid', message: 'too_big' };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return { status: 'invalid', message: 'not_pdf' };

  const supabase = await createClient();
  const path = `${userId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage.from('resumes').upload(path, bytes, { contentType: 'application/pdf' });
  if (uploadError) return { status: 'error' };

  const previous = await loadPrimaryCv(supabase);
  if (previous) await supabase.from('resumes').update({ is_primary: false }).eq('id', previous.id);
  const fileName = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 200) || 'cv.pdf';
  const { data: row, error } = await supabase.from('resumes').insert({ user_id: userId, storage_path: path, file_name: fileName, is_primary: true }).select('id').single();
  if (error || !row) {
    await supabase.storage.from('resumes').remove([path]);
    if (previous) await supabase.from('resumes').update({ is_primary: true }).eq('id', previous.id);
    return { status: 'error' };
  }
  if (previous) {
    await supabase.storage.from('resumes').remove([previous.path]);
    await supabase.from('resumes').delete().eq('id', previous.id);
  }
  revalidatePath('/[locale]/profile', 'page');

  if (!privateAiAvailable()) {
    await supabase.from('resumes').update({ parse_error: 'ai_unavailable' }).eq('id', row.id);
    return { status: 'stored', message: 'ai_unavailable' };
  }
  try {
    const parsed = await parseCv(getLlm(), { pdfBase64: bytes.toString('base64') });
    await supabase.from('resumes').update({ parsed, parse_error: null }).eq('id', row.id);
    return { status: 'parsed' };
  } catch (err) {
    console.error('parseCv failed', err instanceof Error ? err.message : err);
    await supabase.from('resumes').update({ parse_error: 'parse_failed' }).eq('id', row.id);
    return { status: 'stored', message: 'parse_failed' };
  }
}

export async function createSearchProfileFromCv(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const supabase = await createClient();
  const cv = await loadPrimaryCv(supabase);
  if (!cv?.parsed) return;
  const p = searchProfileFromCv(cv.parsed);
  const { data, error } = await supabase
    .from('search_profiles')
    .insert({ user_id: userId, name: p.name, keywords: p.keywords, skills: p.skills, seniority: p.seniority, locations: p.locations, remote_type: p.remoteType })
    .select('id')
    .single();
  if (error || !data) return;
  await requestProfileSync(data.id);
  revalidatePath('/[locale]/search', 'page');
  redirect({ href: '/search', locale: await getLocale() });
}

export async function fillContactsFromCv(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;
  const supabase = await createClient();
  const cv = await loadPrimaryCv(supabase);
  if (!cv?.parsed) return false;
  const { data: profile } = await supabase.from('profiles').select('contacts, full_name').eq('id', userId).single();
  const current = (profile?.contacts ?? {}) as Record<string, string | undefined>;
  const next: Record<string, string> = Object.fromEntries(Object.entries(current).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
  for (const [k, v] of Object.entries(cv.parsed.contacts)) if (v && !next[k]) next[k] = v;
  const { error } = await supabase
    .from('profiles')
    .update({ contacts: next, ...(profile?.full_name ? {} : { full_name: cv.parsed.fullName ?? '' }) })
    .eq('id', userId);
  revalidatePath('/[locale]/profile', 'page');
  return !error;
}
```

- [ ] **Step 3: Секция CV в профиле**

`profile/cv-section.tsx`:
```tsx
'use client';

import type { ParsedCv } from '@jp/ai';
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { createSearchProfileFromCv, fillContactsFromCv, uploadCv, type CvState } from './cv-actions';

export function CvSection({ cv, aiAvailable, cvLink }: { cv: { fileName: string; parsed: ParsedCv | null; parseError: string | null } | null; aiAvailable: boolean; cvLink: string | null }) {
  const t = useTranslations('cv');
  const [state, action, pending] = useActionState<CvState, FormData>(uploadCv, { status: 'idle' });
  const [filled, setFilled] = useState<boolean | null>(null);
  const parsed = cv?.parsed ?? null;
  return (
    <section data-testid="cv-section" className="brutal flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      {!aiAvailable && <p className="text-sm text-warning">{t('aiUnavailable')}</p>}
      <form action={action} className="flex flex-wrap items-center gap-3">
        <input data-testid="cv-file" type="file" name="cv" accept="application/pdf" required className="text-sm" />
        <button type="submit" data-testid="cv-upload" disabled={pending} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">
          {pending ? t('uploading') : t('upload')}
        </button>
      </form>
      <p data-testid="cv-status" role="status" className="text-sm">
        {state.status === 'parsed' && t('parsed')}
        {state.status === 'stored' && t(state.message === 'ai_unavailable' ? 'storedNoAi' : 'storedParseFailed')}
        {state.status === 'invalid' && t(state.message === 'too_big' ? 'tooBig' : 'notPdf')}
        {state.status === 'error' && t('error')}
      </p>
      {cv && (
        <div className="flex flex-col gap-3">
          <p className="font-mono text-xs uppercase text-muted-foreground">
            {cv.fileName} {cvLink && <a data-testid="cv-link" href={cvLink} target="_blank" rel="noopener" className="underline">{t('open')}</a>}
          </p>
          {parsed && (
            <>
              <p data-testid="cv-headline" className="font-display text-xl font-black">
                {parsed.headline}{parsed.seniority ? ` · ${parsed.seniority}` : ''}{parsed.yearsExperience != null ? ` · ${t('years', { count: parsed.yearsExperience })}` : ''}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {parsed.skills.map((s) => <li key={s} data-testid="cv-skill" className="rounded-sm border-2 border-border px-1.5 py-0.5 font-mono text-xs">{s}</li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                <form action={createSearchProfileFromCv}>
                  <button type="submit" data-testid="cv-create-search" className="brutal brutal-press px-3 py-1.5 text-sm font-semibold">{t('createSearch')}</button>
                </form>
                <button type="button" data-testid="cv-fill-contacts" onClick={async () => setFilled(await fillContactsFromCv())} className="brutal brutal-press px-3 py-1.5 text-sm font-semibold">
                  {t('fillContacts')}
                </button>
                {filled !== null && <span role="status" className="self-center text-sm">{t(filled ? 'contactsFilled' : 'error')}</span>}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
```

`profile/page.tsx` — загрузить CV и отрисовать секцию после формы профиля:
```tsx
import { privateAiAvailable } from '@/lib/ai';
import { cvSignedUrl, loadPrimaryCv } from '@/lib/cv';
import { CvSection } from './cv-section';
```
```tsx
  const cv = await loadPrimaryCv(supabase);
  const cvLink = cv ? await cvSignedUrl(supabase, cv.path) : null;
```
и в разметке после `<ProfileForm …/>`:
```tsx
      <CvSection cv={cv ? { fileName: cv.fileName, parsed: cv.parsed, parseError: cv.parseError } : null} aiAvailable={privateAiAvailable()} cvLink={cvLink} />
```

- [ ] **Step 4: Сообщения** — объект `cv` во всех трёх локалях:

en: `"title": "Your CV"`, `"upload": "Upload PDF"`, `"uploading": "Uploading…"`, `"parsed": "CV read: check the skills below."`, `"storedNoAi": "CV saved. AI reading is unavailable (no private AI key)."`, `"storedParseFailed": "CV saved, but AI couldn't read it."`, `"notPdf": "Choose a PDF file."`, `"tooBig": "The file is larger than 5 MB."`, `"error": "Something went wrong. Try again."`, `"aiUnavailable": "AI for personal data is off: add a paid private Gemini key to enable CV reading, letters and messages."`, `"open": "Open"`, `"years": "{count, plural, one {# year} other {# years}}"`, `"createSearch": "Create a job search from my CV"`, `"fillContacts": "Fill empty contacts from CV"`, `"contactsFilled": "Contacts updated."`.
uk: `"title": "Ваше CV"`, `"upload": "Завантажити PDF"`, `"uploading": "Завантаження…"`, `"parsed": "CV прочитано: перевірте навички нижче."`, `"storedNoAi": "CV збережено. AI-читання недоступне (немає приватного AI-ключа)."`, `"storedParseFailed": "CV збережено, але AI не зміг його прочитати."`, `"notPdf": "Оберіть PDF-файл."`, `"tooBig": "Файл більший за 5 МБ."`, `"error": "Щось пішло не так. Спробуйте ще раз."`, `"aiUnavailable": "AI для особистих даних вимкнено: додайте платний приватний ключ Gemini, щоб читати CV, писати листи й повідомлення."`, `"open": "Відкрити"`, `"years": "{count, plural, one {# рік} few {# роки} many {# років} other {# року}}"`, `"createSearch": "Створити пошук за моїм CV"`, `"fillContacts": "Заповнити порожні контакти з CV"`, `"contactsFilled": "Контакти оновлено."`.
ru: `"title": "Ваше CV"`, `"upload": "Загрузить PDF"`, `"uploading": "Загрузка…"`, `"parsed": "CV прочитано: проверьте навыки ниже."`, `"storedNoAi": "CV сохранено. AI-чтение недоступно (нет приватного AI-ключа)."`, `"storedParseFailed": "CV сохранено, но AI не смог его прочитать."`, `"notPdf": "Выберите PDF-файл."`, `"tooBig": "Файл больше 5 МБ."`, `"error": "Что-то пошло не так. Попробуйте ещё раз."`, `"aiUnavailable": "AI для личных данных выключен: добавьте платный приватный ключ Gemini, чтобы читать CV, писать письма и сообщения."`, `"open": "Открыть"`, `"years": "{count, plural, one {# год} few {# года} many {# лет} other {# года}}"`, `"createSearch": "Создать поиск по моему CV"`, `"fillContacts": "Заполнить пустые контакты из CV"`, `"contactsFilled": "Контакты обновлены."`.

- [ ] **Step 5: E2E**

`apps/web/e2e/fixtures/cv.pdf` — минимальный валидный PDF (создать скриптом, содержимое ASCII):
```bash
printf '%%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%%%EOF\n' > apps/web/e2e/fixtures/cv.pdf
```
`apps/web/e2e/cv.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('uploads a CV, reads it with AI and creates a search from it', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles(new URL('./fixtures/cv.pdf', import.meta.url).pathname);
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toContainText('CV read');
  await page.reload();
  await expect(page.getByTestId('cv-headline')).toContainText('Full Stack Developer');
  await expect(page.getByTestId('cv-skill').filter({ hasText: 'React' })).toBeVisible();
  await expect(page.getByTestId('cv-link')).toHaveAttribute('href', /token=/);
  await page.getByTestId('cv-fill-contacts').click();
  await expect(page.getByText('Contacts updated.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('LinkedIn')).toHaveValue('https://www.linkedin.com/in/test-user');
  await page.getByTestId('cv-create-search').click();
  await expect(page).toHaveURL(/\/en\/search$/);
  await expect(page.getByText('Full Stack Developer').first()).toBeVisible();
});

test('rejects a non-PDF file', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('cv-bad'));
  await page.goto('/en/profile');
  await page.getByTestId('cv-file').setInputFiles({ name: 'cv.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a pdf') });
  await page.getByTestId('cv-upload').click();
  await expect(page.getByTestId('cv-status')).toHaveText('Choose a PDF file.');
});
```
README, раздел «Local setup»: строка — «Personal-data AI (CV, letters, recruiter messages) needs a **paid** Gemini key in `apps/web/.env.local` as `GEMINI_API_KEY_PRIVATE`; E2E uses `AI_PROVIDER=fake`.»

- [ ] **Step 6: Проверка и commit**

Run: `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS. Если на порту 3100 уже запущен dev-сервер без `AI_PROVIDER=fake`, остановить **только свой** процесс (иначе `reuseExistingServer` возьмёт его).
```bash
git add apps/web README.md pnpm-lock.yaml
git commit -m "feat(web): CV upload with private-AI reading, search profile and contacts from CV

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Банк ответов, шаблон письма и онбординг

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/profile/{answer-bank.tsx,letter-template.tsx,profile-extras-actions.ts}`, `apps/web/src/app/[locale]/(app)/onboarding/{page.tsx,onboarding-actions.ts}`, `apps/web/e2e/onboarding.spec.ts`
- Modify: `apps/web/src/app/[locale]/(app)/profile/page.tsx`, `apps/web/src/app/[locale]/(app)/today/page.tsx` (баннер), `apps/web/messages/{en,uk,ru}.json`

**Interfaces:**
- Consumes: `BANK_KEYS`, `isLocale` (`@jp/core`); `CvSection` (Task 3); таблицы `answer_bank`, `letter_templates`.
- Produces:
  - Server actions (`profile-extras-actions.ts`): `saveBankAnswer(input: { key: string | null; question: string; answer: string; locale: Locale }): Promise<{ ok: boolean; key?: string }>` (key null → slug из вопроса; ответ пишется в `answer[locale]`), `deleteBankAnswer(key: string): Promise<boolean>`, `saveLetterTemplate(locale: Locale, body: string): Promise<boolean>`.
  - `onboarding-actions.ts`: `finishOnboarding(): Promise<void>` (ставит `profiles.onboarded_at = now()`, redirect `/today`).
  - Компоненты `AnswerBank({ answers, locale })`, `LetterTemplate({ body, locale })`.
  - `DEFAULT_TEMPLATE: Record<Locale, string>` (в `letter-template.tsx`), с плейсхолдером `[…]`.
  - Test ids: `answer-bank`, `bank-answer` (`data-key`), `bank-save`, `bank-add-question`, `bank-add-answer`, `bank-add`, `letter-template`, `template-body`, `template-save`, `onboarding`, `onboarding-finish`, `onboarding-banner`.

- [ ] **Step 1: Server actions**

`profile/profile-extras-actions.ts`:
```ts
'use server';

import { isLocale, type Locale } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const KEY = /^[a-z0-9_]{1,40}$/;

function slug(question: string): string {
  const base = question.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32);
  return `${base || 'q'}_${Math.random().toString(36).slice(2, 6)}`;
}

export async function saveBankAnswer(input: { key: string | null; question: string; answer: string; locale: Locale }): Promise<{ ok: boolean; key?: string }> {
  const userId = await getUserId();
  const question = input.question.trim().slice(0, 300);
  const answer = input.answer.trim().slice(0, 2000);
  if (!userId || !question || !isLocale(input.locale) || (input.key !== null && !KEY.test(input.key))) return { ok: false };
  const key = input.key ?? slug(question);
  const supabase = await createClient();
  const { data: existing } = await supabase.from('answer_bank').select('answer').eq('key', key).maybeSingle();
  const merged = { ...((existing?.answer ?? {}) as Record<string, string>), [input.locale]: answer };
  const { error } = await supabase.from('answer_bank').upsert({ user_id: userId, key, question, answer: merged }, { onConflict: 'user_id,key' });
  revalidatePath('/[locale]/profile', 'page');
  return error ? { ok: false } : { ok: true, key };
}

export async function deleteBankAnswer(key: string): Promise<boolean> {
  if (!(await getUserId()) || !KEY.test(key)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('answer_bank').delete().eq('key', key).select('id');
  revalidatePath('/[locale]/profile', 'page');
  return !error && (data?.length ?? 0) > 0;
}

export async function saveLetterTemplate(locale: Locale, body: string): Promise<boolean> {
  const userId = await getUserId();
  const text = body.trim().slice(0, 5000);
  if (!userId || !isLocale(locale) || !text) return false;
  const supabase = await createClient();
  const { error } = await supabase.from('letter_templates').upsert({ user_id: userId, locale, body: text }, { onConflict: 'user_id,locale' });
  revalidatePath('/[locale]/profile', 'page');
  return !error;
}
```

- [ ] **Step 2: Компоненты**

`profile/answer-bank.tsx`:
```tsx
'use client';

import { BANK_KEYS, type Locale } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { deleteBankAnswer, saveBankAnswer } from './profile-extras-actions';

export type BankAnswer = { key: string; question: string; answer: string };

export function AnswerBank({ answers, locale }: { answers: BankAnswer[]; locale: Locale }) {
  const t = useTranslations('bank');
  const base: BankAnswer[] = BANK_KEYS.map((key) => answers.find((a) => a.key === key) ?? { key, question: t(`q_${key}`), answer: '' });
  const custom = answers.filter((a) => !(BANK_KEYS as readonly string[]).includes(a.key));
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries([...base, ...custom].map((a) => [a.key, a.answer])));
  const [newQ, setNewQ] = useState('');
  const [newA, setNewA] = useState('');
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const field = 'brutal bg-card px-2 py-1 text-sm';

  const save = async (a: BankAnswer) => {
    const res = await saveBankAnswer({ key: a.key, question: a.question, answer: values[a.key] ?? '', locale });
    setStatus(res.ok ? 'saved' : 'error');
  };

  return (
    <section data-testid="answer-bank" className="brutal flex max-w-2xl flex-col gap-4 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      {[...base, ...custom].map((a) => (
        <div key={a.key} data-testid="bank-answer" data-key={a.key} className="flex flex-col gap-1">
          <label htmlFor={`bank-${a.key}`} className="font-mono text-xs uppercase">{a.question}</label>
          <div className="flex gap-2">
            <textarea id={`bank-${a.key}`} value={values[a.key] ?? ''} maxLength={2000} onChange={(e) => setValues((v) => ({ ...v, [a.key]: e.target.value }))} className={`${field} min-h-14 flex-1`} />
            <div className="flex flex-col gap-1">
              <button type="button" data-testid="bank-save" onClick={() => void save(a)} className="brutal brutal-press px-3 py-1 text-sm font-semibold">{t('save')}</button>
              {!(BANK_KEYS as readonly string[]).includes(a.key) && (
                <button type="button" onClick={async () => setStatus((await deleteBankAnswer(a.key)) ? 'saved' : 'error')} className="text-xs text-danger underline">{t('delete')}</button>
              )}
            </div>
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2 border-t-2 border-border pt-3">
        <input data-testid="bank-add-question" value={newQ} maxLength={300} onChange={(e) => setNewQ(e.target.value)} placeholder={t('newQuestion')} className={field} />
        <textarea data-testid="bank-add-answer" value={newA} maxLength={2000} onChange={(e) => setNewA(e.target.value)} placeholder={t('newAnswer')} className={`${field} min-h-14`} />
        <button
          type="button"
          data-testid="bank-add"
          disabled={!newQ.trim() || !newA.trim()}
          onClick={async () => {
            const res = await saveBankAnswer({ key: null, question: newQ, answer: newA, locale });
            setStatus(res.ok ? 'saved' : 'error');
            if (res.ok) { setNewQ(''); setNewA(''); }
          }}
          className="brutal brutal-press self-start px-3 py-1 text-sm font-semibold disabled:opacity-50"
        >
          {t('add')}
        </button>
      </div>
      <p role="status" className="text-sm">{status === 'saved' && t('saved')}{status === 'error' && t('error')}</p>
    </section>
  );
}
```

`profile/letter-template.tsx`:
```tsx
'use client';

import type { Locale } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { saveLetterTemplate } from './profile-extras-actions';

export const DEFAULT_TEMPLATE: Record<Locale, string> = {
  en: 'Hello!\n\nI am interested in the [role] position at [company]. [Why I fit this job]\n\nI would be glad to talk.\nBest regards',
  uk: 'Вітаю!\n\nМене зацікавила позиція [роль] у [компанія]. [Чому я підходжу]\n\nБуду радий поспілкуватися.\nЗ повагою',
  ru: 'Здравствуйте!\n\nМеня заинтересовала позиция [роль] в [компания]. [Почему я подхожу]\n\nБуду рад пообщаться.\nС уважением',
};

export function LetterTemplate({ body, locale }: { body: string | null; locale: Locale }) {
  const t = useTranslations('template');
  const [text, setText] = useState(body ?? DEFAULT_TEMPLATE[locale]);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  return (
    <section data-testid="letter-template" className="brutal flex max-w-2xl flex-col gap-3 p-5">
      <h2 className="font-display text-lg font-bold">{t('title')}</h2>
      <p className="text-sm text-muted-foreground">{t('hint')}</p>
      <textarea data-testid="template-body" value={text} maxLength={5000} onChange={(e) => setText(e.target.value)} aria-label={t('title')} className="brutal min-h-40 bg-card px-2 py-1 text-sm" />
      <div className="flex items-center gap-3">
        <button type="button" data-testid="template-save" onClick={async () => setStatus((await saveLetterTemplate(locale, text)) ? 'saved' : 'error')} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('save')}</button>
        <p role="status" className="text-sm">{status === 'saved' && t('saved')}{status === 'error' && t('error')}</p>
      </div>
    </section>
  );
}
```

`profile/page.tsx` — загрузить `answer_bank` (`key, question, answer`) и `letter_templates` для текущей локали; отрисовать `<LetterTemplate>` и `<AnswerBank>` после `CvSection`. Ответ для локали: `typeof a.answer === 'object' ? (a.answer as Record<string,string>)[locale] ?? '' : ''`.

- [ ] **Step 3: Онбординг**

`onboarding/onboarding-actions.ts`:
```ts
'use server';

import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export async function finishOnboarding(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const supabase = await createClient();
  await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', userId);
  redirect({ href: '/today', locale: await getLocale() });
}
```
`onboarding/page.tsx` — серверная страница: заголовок, нумерованные шаги (`<ol>`): 1) `CvSection` (с кнопками «Создать поиск по CV»), 2) ссылка «Настроить поиск вручную» на `/search`, 3) `LetterTemplate`, 4) `AnswerBank`, 5) форма с кнопкой `onboarding-finish` → `finishOnboarding`. Данные грузятся так же, как на `/profile` (вынести загрузку в общий хелпер `loadProfileExtras(supabase, userId, locale)` в `profile/extras-data.ts`, возвращающий `{ cv, cvLink, answers, template }`; использовать на обеих страницах). `data-testid="onboarding"` на корне.

`today/page.tsx` — если `profiles.onboarded_at` пуст, над лентой показать баннер:
```tsx
<Link href="/onboarding" data-testid="onboarding-banner" className="brutal brutal-press flex items-center justify-between gap-3 bg-ai p-4 font-semibold text-white">
  {t('onboardingBanner')} →
</Link>
```
(ключ `today.onboardingBanner`).

- [ ] **Step 4: Сообщения** — объекты `bank`, `template`, `onboarding` и ключ `today.onboardingBanner`, во всех трёх локалях:

en:
- `bank`: `"title": "Answer bank"`, `"hint": "Typical form questions are answered from here instantly, without AI."`, `"q_salary": "Salary expectations"`, `"q_start_date": "When can you start"`, `"q_english": "English level"`, `"q_why_looking": "Why are you looking for a new job"`, `"q_work_format": "Preferred work format"`, `"save": "Save"`, `"delete": "Delete"`, `"newQuestion": "Another question you often get"`, `"newAnswer": "Your answer"`, `"add": "Add to bank"`, `"saved": "Saved."`, `"error": "Couldn't save. Try again."`
- `template`: `"title": "Cover letter template"`, `"hint": "AI replaces only the [...] parts with lines about each job."`, `"save": "Save template"`, `"saved": "Saved."`, `"error": "Couldn't save. Try again."`
- `onboarding`: `"title": "Let's set you up"`, `"stepCv": "Upload your CV"`, `"stepSearch": "Set up what you're looking for"`, `"manualSearch": "Set up the search manually"`, `"stepTemplate": "Your cover letter template"`, `"stepAnswers": "Answers to typical questions"`, `"finish": "Done — show me jobs"`
- `today.onboardingBanner`: `"Finish setting up: CV, letter template and typical answers"`

uk:
- `bank`: `"title": "Банк відповідей"`, `"hint": "Типові питання форм отримують відповідь звідси миттєво, без AI."`, `"q_salary": "Зарплатні очікування"`, `"q_start_date": "Коли можете почати"`, `"q_english": "Рівень англійської"`, `"q_why_looking": "Чому шукаєте нову роботу"`, `"q_work_format": "Бажаний формат роботи"`, `"save": "Зберегти"`, `"delete": "Видалити"`, `"newQuestion": "Інше питання, яке часто ставлять"`, `"newAnswer": "Ваша відповідь"`, `"add": "Додати в банк"`, `"saved": "Збережено."`, `"error": "Не вдалося зберегти. Спробуйте ще раз."`
- `template`: `"title": "Шаблон супровідного листа"`, `"hint": "AI замінює лише частини [...] рядками про конкретну вакансію."`, `"save": "Зберегти шаблон"`, `"saved": "Збережено."`, `"error": "Не вдалося зберегти. Спробуйте ще раз."`
- `onboarding`: `"title": "Налаштуймо все"`, `"stepCv": "Завантажте CV"`, `"stepSearch": "Що ви шукаєте"`, `"manualSearch": "Налаштувати пошук вручну"`, `"stepTemplate": "Шаблон супровідного листа"`, `"stepAnswers": "Відповіді на типові питання"`, `"finish": "Готово — покажіть вакансії"`
- `today.onboardingBanner`: `"Завершіть налаштування: CV, шаблон листа і типові відповіді"`

ru:
- `bank`: `"title": "Банк ответов"`, `"hint": "Типовые вопросы форм получают ответ отсюда мгновенно, без AI."`, `"q_salary": "Зарплатные ожидания"`, `"q_start_date": "Когда можете приступить"`, `"q_english": "Уровень английского"`, `"q_why_looking": "Почему ищете новую работу"`, `"q_work_format": "Предпочтительный формат работы"`, `"save": "Сохранить"`, `"delete": "Удалить"`, `"newQuestion": "Другой вопрос, который часто задают"`, `"newAnswer": "Ваш ответ"`, `"add": "Добавить в банк"`, `"saved": "Сохранено."`, `"error": "Не удалось сохранить. Попробуйте ещё раз."`
- `template`: `"title": "Шаблон сопроводительного письма"`, `"hint": "AI заменяет только части [...] строками о конкретной вакансии."`, `"save": "Сохранить шаблон"`, `"saved": "Сохранено."`, `"error": "Не удалось сохранить. Попробуйте ещё раз."`
- `onboarding`: `"title": "Давайте всё настроим"`, `"stepCv": "Загрузите CV"`, `"stepSearch": "Что вы ищете"`, `"manualSearch": "Настроить поиск вручную"`, `"stepTemplate": "Шаблон сопроводительного письма"`, `"stepAnswers": "Ответы на типовые вопросы"`, `"finish": "Готово — покажите вакансии"`
- `today.onboardingBanner`: `"Завершите настройку: CV, шаблон письма и типовые ответы"`

- [ ] **Step 5: E2E** — `apps/web/e2e/onboarding.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test('onboarding: answer bank, letter template, finish', async ({ context, page }) => {
  await loginAs(context, uniqueEmail('onboarding'));
  await page.goto('/en/today');
  await page.getByTestId('onboarding-banner').click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  const salary = page.locator('[data-testid="bank-answer"][data-key="salary"]');
  await salary.getByRole('textbox').fill('$4000–4500 per month');
  await salary.getByTestId('bank-save').click();
  await expect(page.getByText('Saved.').first()).toBeVisible();
  await page.getByTestId('template-body').fill('Hi [company]! [why me]');
  await page.getByTestId('template-save').click();
  await page.getByTestId('onboarding-finish').click();
  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(page.getByTestId('onboarding-banner')).toHaveCount(0);
  await page.goto('/en/profile');
  await expect(salary.getByRole('textbox')).toHaveValue('$4000–4500 per month');
  await expect(page.getByTestId('template-body')).toHaveValue('Hi [company]! [why me]');
});
```

- [ ] **Step 6: Проверка и commit**

Run: `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS (существующие тесты `/today` не должны ломаться из-за баннера — он отдельный элемент).
```bash
git add apps/web
git commit -m "feat(web): answer bank, cover letter template and onboarding

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Набор отклика — в ленте и на карточке доски

**Files:**
- Create: `apps/web/src/components/apply-kit/{actions.ts,apply-kit-panel.tsx,contact-chips.tsx}`, `apps/web/e2e/apply-kit.spec.ts`
- Modify: `apps/web/src/app/[locale]/(app)/today/{feed-types.ts,page.tsx,match-detail.tsx}`, `apps/web/src/app/[locale]/(app)/board/{board-types.ts,page.tsx,card-panel.tsx}`, `apps/web/messages/{en,uk,ru}.json`, `apps/web/e2e/helpers/seed.ts`

**Interfaces:**
- Consumes: `generateApplyKit`, `answerForm`, `type ApplyKit`, `type KitJob` (`@jp/ai`); `splitQuestions`, `matchBankKey`, `rankAtTop` (`@jp/core`); `getLlm`, `privateAiAvailable` (Task 3); `loadPrimaryCv`, `cvSignedUrl` (Task 3); RPC `save_match_to_board`, `move_application`.
- Produces:
  - Server actions (`components/apply-kit/actions.ts`): `type KitError = 'ai_unavailable' | 'no_cv' | 'not_found' | 'failed'`; `getApplyKitData(jobId: string): Promise<KitData | null>` где `type KitData = { kit: StoredKit | null; aiAvailable: boolean; hasCv: boolean; contacts: Record<string, string>; cvLink: string | null; jobUrl: string | null }` и `type StoredKit = ApplyKit & { formAnswers: { question: string; answer: string; fromBank: boolean }[] }`; `generateKit(jobId: string, opts: { lang: 'auto'|'en'|'uk'|'ru'; tone: 'default'|'shorter'|'formal' }): Promise<{ ok: true; kit: StoredKit } | { ok: false; error: KitError }>`; `answerFormQuestions(jobId: string, formText: string): Promise<{ ok: true; answers: StoredKit['formAnswers'] } | { ok: false; error: KitError }>`; `markAppliedFromKit(jobId: string, letterKind: 'full' | 'short' | 'none'): Promise<boolean>`.
  - `FeedMatch.jobId: string`; `BoardCard.jobId: string | null`.
  - UI: `ApplyKitPanel({ jobId })` — загружает данные сам; `ContactChips({ contacts, cvLink })`.
  - Test ids: `apply-kit-open`, `apply-kit`, `kit-generate`, `kit-error`, `kit-requirement` (`data-status`), `kit-red-flag`, `kit-letter`, `kit-short`, `kit-copy-letter`, `kit-copy-short`, `kit-salary`, `kit-form-input`, `kit-form-submit`, `kit-answer` (`data-from-bank`), `kit-save-answer`, `contact-chip`, `kit-apply`, `kit-applied-yes`, `kit-applied-no`.

- [ ] **Step 1: Server actions**

`components/apply-kit/actions.ts`:
```ts
'use server';

import { answerForm, type ApplyKit, generateApplyKit, type KitJob } from '@jp/ai';
import { matchBankKey, rankAtTop, splitQuestions } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getLlm, privateAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { cvSignedUrl, loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type KitError = 'ai_unavailable' | 'no_cv' | 'not_found' | 'failed';
export type FormAnswer = { question: string; answer: string; fromBank: boolean };
export type StoredKit = ApplyKit & { formAnswers: FormAnswer[] };
export type KitData = { kit: StoredKit | null; aiAvailable: boolean; hasCv: boolean; contacts: Record<string, string>; cvLink: string | null; jobUrl: string | null };

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadJob(supabase: Supabase, jobId: string): Promise<(KitJob & { url: string | null; salaryMinUsd: number | null }) | null> {
  const { data } = await supabase
    .from('jobs')
    .select('title, description_text, salary_raw, salary_min_usd, salary_max_usd, companies(name), job_postings(url, seen_at)')
    .eq('id', jobId)
    .maybeSingle();
  if (!data) return null;
  const salary = data.salary_raw ?? (data.salary_min_usd || data.salary_max_usd ? `$${data.salary_min_usd ?? '?'}–${data.salary_max_usd ?? '?'} per month` : null);
  const url = [...data.job_postings].sort((a, b) => (a.seen_at < b.seen_at ? 1 : -1)).find((p) => /^https?:\/\//i.test(p.url))?.url ?? null;
  return { title: data.title, company: data.companies?.name ?? '', description: data.description_text, salary, url, salaryMinUsd: null };
}

function toStored(row: { lang: string; requirements: unknown; red_flags: string[]; cover_letter: string; short_message: string; salary_hint: string | null; form_answers: unknown }): StoredKit {
  return {
    lang: row.lang,
    requirements: Array.isArray(row.requirements) ? (row.requirements as ApplyKit['requirements']) : [],
    redFlags: row.red_flags,
    coverLetter: row.cover_letter,
    shortMessage: row.short_message,
    salaryHint: row.salary_hint,
    formAnswers: Array.isArray(row.form_answers) ? (row.form_answers as FormAnswer[]) : [],
  };
}

export async function getApplyKitData(jobId: string): Promise<KitData | null> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId)) return null;
  const supabase = await createClient();
  const [{ data: kit }, cv, { data: profile }, job] = await Promise.all([
    supabase.from('apply_kits').select('lang, requirements, red_flags, cover_letter, short_message, salary_hint, form_answers').eq('job_id', jobId).maybeSingle(),
    loadPrimaryCv(supabase),
    supabase.from('profiles').select('contacts').eq('id', userId).single(),
    loadJob(supabase, jobId),
  ]);
  const contacts = Object.fromEntries(Object.entries((profile?.contacts ?? {}) as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
  return {
    kit: kit ? toStored(kit) : null,
    aiAvailable: privateAiAvailable(),
    hasCv: Boolean(cv?.parsed),
    contacts,
    cvLink: cv ? await cvSignedUrl(supabase, cv.path) : null,
    jobUrl: job?.url ?? null,
  };
}

export async function generateKit(jobId: string, opts: { lang: 'auto' | 'en' | 'uk' | 'ru'; tone: 'default' | 'shorter' | 'formal' }): Promise<{ ok: true; kit: StoredKit } | { ok: false; error: KitError }> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || !['auto', 'en', 'uk', 'ru'].includes(opts.lang) || !['default', 'shorter', 'formal'].includes(opts.tone)) return { ok: false, error: 'not_found' };
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  const [job, cv] = await Promise.all([loadJob(supabase, jobId), loadPrimaryCv(supabase)]);
  if (!job) return { ok: false, error: 'not_found' };
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  const langForTemplate = opts.lang === 'auto' ? null : opts.lang;
  const [{ data: templates }, { data: profiles }] = await Promise.all([
    supabase.from('letter_templates').select('locale, body'),
    supabase.from('search_profiles').select('salary_min_usd').not('salary_min_usd', 'is', null).limit(1),
  ]);
  const template = (langForTemplate ? templates?.find((t) => t.locale === langForTemplate) : templates?.[0])?.body ?? null;
  try {
    const kit = await generateApplyKit(getLlm(), { job, cv: cv.parsed, template, lang: opts.lang, tone: opts.tone, salaryMinUsd: profiles?.[0]?.salary_min_usd ?? null });
    const { data: existing } = await supabase.from('apply_kits').select('form_answers').eq('job_id', jobId).maybeSingle();
    const row = {
      user_id: userId,
      job_id: jobId,
      lang: kit.lang,
      requirements: kit.requirements,
      red_flags: kit.redFlags,
      cover_letter: kit.coverLetter,
      short_message: kit.shortMessage,
      salary_hint: kit.salaryHint,
      generated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('apply_kits').upsert(row, { onConflict: 'user_id,job_id' });
    if (error) return { ok: false, error: 'failed' };
    return { ok: true, kit: { ...kit, formAnswers: Array.isArray(existing?.form_answers) ? (existing.form_answers as FormAnswer[]) : [] } };
  } catch (err) {
    console.error('generateKit failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'failed' };
  }
}

export async function answerFormQuestions(jobId: string, formText: string): Promise<{ ok: true; answers: FormAnswer[] } | { ok: false; error: KitError }> {
  const userId = await getUserId();
  const questions = splitQuestions(formText.slice(0, 10_000));
  if (!userId || !UUID.test(jobId) || questions.length === 0) return { ok: false, error: 'not_found' };
  const supabase = await createClient();
  const [{ data: bank }, { data: kit }, { data: profile }] = await Promise.all([
    supabase.from('answer_bank').select('key, answer'),
    supabase.from('apply_kits').select('lang').eq('job_id', jobId).maybeSingle(),
    supabase.from('profiles').select('locale').eq('id', userId).single(),
  ]);
  const lang = kit?.lang ?? profile?.locale ?? 'en';
  const fromBank = (q: string): string | null => {
    const key = matchBankKey(q);
    const row = key ? bank?.find((b) => b.key === key) : undefined;
    const answers = (row?.answer ?? {}) as Record<string, string>;
    return row ? (answers[lang] || answers.en || Object.values(answers).find(Boolean) || null) : null;
  };
  const answers: FormAnswer[] = questions.map((q) => {
    const a = fromBank(q);
    return { question: q, answer: a ?? '', fromBank: a !== null };
  });
  const missing = answers.filter((a) => !a.fromBank);
  if (missing.length > 0) {
    if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
    const [job, cv] = await Promise.all([loadJob(supabase, jobId), loadPrimaryCv(supabase)]);
    if (!job) return { ok: false, error: 'not_found' };
    if (!cv?.parsed) return { ok: false, error: 'no_cv' };
    try {
      const generated = await answerForm(getLlm(), { questions: missing.map((m) => m.question), job, cv: cv.parsed, lang });
      missing.forEach((m, i) => { m.answer = generated[i] ?? ''; });
    } catch (err) {
      console.error('answerForm failed', err instanceof Error ? err.message : err);
      return { ok: false, error: 'failed' };
    }
  }
  await supabase.from('apply_kits').update({ form_answers: answers }).eq('job_id', jobId);
  return { ok: true, answers };
}

/** "Did you apply?" → yes: the job's card goes to Applied (created from the match if needed) with the letter used. */
export async function markAppliedFromKit(jobId: string, letterKind: 'full' | 'short' | 'none'): Promise<boolean> {
  const userId = await getUserId();
  if (!userId || !UUID.test(jobId) || !['full', 'short', 'none'].includes(letterKind)) return false;
  const supabase = await createClient();
  const { data: applied } = await supabase.from('board_columns').select('id').eq('key', 'applied').single();
  if (!applied) return false;
  const { data: first } = await supabase.from('applications').select('rank').eq('column_id', applied.id).order('rank').limit(1).maybeSingle();
  const rank = rankAtTop(first?.rank ?? null);
  let { data: app } = await supabase.from('applications').select('id, column_id').eq('job_id', jobId).maybeSingle();
  if (!app) {
    const { data: match } = await supabase.from('job_matches').select('id').eq('job_id', jobId).maybeSingle();
    if (!match) return false;
    const { data, error } = await supabase.rpc('save_match_to_board', { p_match_id: match.id, p_column_key: 'applied', p_rank: rank });
    if (error || !data?.[0]) return false;
    app = { id: data[0].application_id, column_id: applied.id };
  } else if (app.column_id !== applied.id) {
    const { error } = await supabase.rpc('move_application', { p_id: app.id, p_column_id: applied.id, p_rank: rank });
    if (error) return false;
  }
  const { data: kit } = await supabase.from('apply_kits').select('cover_letter, short_message').eq('job_id', jobId).maybeSingle();
  const letter = letterKind === 'full' ? kit?.cover_letter : letterKind === 'short' ? kit?.short_message : null;
  const { data: updated } = await supabase
    .from('applications')
    .update({ letter_kind: letterKind, letter_used: letter ?? null })
    .eq('id', app.id)
    .select('id');
  revalidatePath('/[locale]/board', 'page');
  return (updated?.length ?? 0) > 0;
}
```

- [ ] **Step 2: Контакты и панель**

`components/apply-kit/contact-chips.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

const ORDER = ['email', 'phone', 'linkedin', 'github', 'portfolio', 'telegram'] as const;

export function ContactChips({ contacts, cvLink }: { contacts: Record<string, string>; cvLink: string | null }) {
  const t = useTranslations('kit');
  const [copied, setCopied] = useState<string | null>(null);
  const items = [...ORDER.filter((k) => contacts[k]).map((k) => ({ key: k, label: t(`contact_${k}`), value: contacts[k]! })), ...(cvLink ? [{ key: 'cv', label: t('contact_cv'), value: cvLink }] : [])];
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t('noContacts')}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('contacts')}>
      {items.map((i) => (
        <li key={i.key}>
          <button
            type="button"
            data-testid="contact-chip"
            onClick={async () => {
              await navigator.clipboard.writeText(i.value).catch(() => undefined);
              setCopied(i.key);
            }}
            className="rounded-sm border-2 border-border px-2 py-0.5 font-mono text-xs hover:bg-muted"
          >
            {copied === i.key ? `✓ ${t('copied')}` : i.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`components/apply-kit/apply-kit-panel.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { saveBankAnswer } from '@/app/[locale]/(app)/profile/profile-extras-actions';
import { answerFormQuestions, type FormAnswer, generateKit, getApplyKitData, type KitData, type KitError, markAppliedFromKit, type StoredKit } from './actions';
import { ContactChips } from './contact-chips';

type Lang = 'auto' | 'en' | 'uk' | 'ru';
type Tone = 'default' | 'shorter' | 'formal';

export function ApplyKitPanel({ jobId, locale, onApplied }: { jobId: string; locale: 'en' | 'uk' | 'ru'; onApplied?: () => void }) {
  const t = useTranslations('kit');
  const [data, setData] = useState<KitData | null>(null);
  const [kit, setKit] = useState<StoredKit | null>(null);
  const [lang, setLang] = useState<Lang>('auto');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<KitError | null>(null);
  const [formText, setFormText] = useState('');
  const [answers, setAnswers] = useState<FormAnswer[]>([]);
  const [letter, setLetter] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [awaitingReturn, setAwaitingReturn] = useState(false);
  const [askApplied, setAskApplied] = useState(false);
  const [appliedState, setAppliedState] = useState<'idle' | 'done' | 'error'>('idle');

  useEffect(() => {
    let alive = true;
    void getApplyKitData(jobId).then((d) => {
      if (!alive || !d) return;
      setData(d);
      setKit(d.kit);
      setLetter(d.kit?.coverLetter ?? '');
      setAnswers(d.kit?.formAnswers ?? []);
    });
    return () => { alive = false; };
  }, [jobId]);

  useEffect(() => {
    if (!awaitingReturn) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setAwaitingReturn(false);
        setAskApplied(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [awaitingReturn]);

  const run = async (tone: Tone) => {
    setLoading(true);
    setError(null);
    try {
      const res = await generateKit(jobId, { lang, tone });
      if (res.ok) {
        setKit(res.kit);
        setLetter(res.kit.coverLetter);
      } else setError(res.error);
    } catch {
      setError('failed');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(key);
  };

  const confirmApplied = async (yes: boolean) => {
    setAskApplied(false);
    if (!yes) return;
    const kind = letter.trim() ? 'full' : kit?.shortMessage ? 'short' : 'none';
    try {
      const ok = await markAppliedFromKit(jobId, kind);
      setAppliedState(ok ? 'done' : 'error');
      if (ok) onApplied?.();
    } catch {
      setAppliedState('error');
    }
  };

  if (!data) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;
  const field = 'brutal bg-card px-2 py-1 text-sm';

  return (
    <section data-testid="apply-kit" aria-label={t('title')} className="flex flex-col gap-4 border-t-2 border-border pt-4">
      <h3 className="font-display text-lg font-black">{t('title')}</h3>
      {!data.aiAvailable && <p data-testid="kit-error" className="text-sm text-warning">{t('err_ai_unavailable')}</p>}
      {data.aiAvailable && !data.hasCv && <p data-testid="kit-error" className="text-sm text-warning">{t('err_no_cv')}</p>}
      {error && <p data-testid="kit-error" role="alert" className="text-sm text-danger">{t(`err_${error}`)}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('language')}
          <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} className={field}>
            {(['auto', 'en', 'uk', 'ru'] as const).map((l) => <option key={l} value={l}>{t(`lang_${l}`)}</option>)}
          </select>
        </label>
        <button type="button" data-testid="kit-generate" disabled={loading || !data.aiAvailable || !data.hasCv} onClick={() => void run('default')} className="brutal brutal-press bg-ai px-4 py-2 font-semibold text-white disabled:opacity-50">
          {loading ? t('generating') : kit ? t('regenerate') : t('generate')}
        </button>
        {kit && (
          <>
            <button type="button" disabled={loading} onClick={() => void run('shorter')} className="brutal brutal-press px-3 py-2 text-sm font-semibold">{t('shorter')}</button>
            <button type="button" disabled={loading} onClick={() => void run('formal')} className="brutal brutal-press px-3 py-2 text-sm font-semibold">{t('formal')}</button>
          </>
        )}
      </div>

      {kit && (
        <>
          <div>
            <h4 className="font-mono text-xs uppercase">{t('requirements')}</h4>
            <ul className="flex flex-col gap-1 text-sm">
              {kit.requirements.map((r) => (
                <li key={r.text} data-testid="kit-requirement" data-status={r.status}>
                  {r.status === 'met' ? '✓' : r.status === 'missing' ? '✗' : '?'} {r.text}
                </li>
              ))}
            </ul>
            {kit.redFlags.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 text-sm text-danger">
                {kit.redFlags.map((f) => <li key={f} data-testid="kit-red-flag">⚑ {f}</li>)}
              </ul>
            )}
          </div>
          <label className="flex flex-col gap-1 font-mono text-xs uppercase">
            {t('letter')}
            <textarea data-testid="kit-letter" value={letter} maxLength={6000} onChange={(e) => setLetter(e.target.value)} className={`${field} min-h-40 font-sans normal-case`} />
          </label>
          <button type="button" data-testid="kit-copy-letter" onClick={() => void copy('letter', letter)} className="brutal brutal-press self-start px-3 py-1 text-sm font-semibold">
            {copied === 'letter' ? `✓ ${t('copied')}` : t('copyLetter')}
          </button>
          <div className="flex flex-col gap-1">
            <h4 className="font-mono text-xs uppercase">{t('short')}</h4>
            <p data-testid="kit-short" className="brutal p-2 text-sm">{kit.shortMessage}</p>
            <button type="button" data-testid="kit-copy-short" onClick={() => void copy('short', kit.shortMessage)} className="brutal brutal-press self-start px-3 py-1 text-sm font-semibold">
              {copied === 'short' ? `✓ ${t('copied')}` : t('copyShort')}
            </button>
          </div>
          {kit.salaryHint && <p data-testid="kit-salary" className="border-l-4 border-warning pl-3 text-sm">💰 {kit.salaryHint}</p>}
        </>
      )}

      <div className="flex flex-col gap-1">
        <h4 className="font-mono text-xs uppercase">{t('contacts')}</h4>
        <ContactChips contacts={data.contacts} cvLink={data.cvLink} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('formQuestions')}
          <textarea data-testid="kit-form-input" value={formText} maxLength={10000} onChange={(e) => setFormText(e.target.value)} placeholder={t('formPlaceholder')} className={`${field} min-h-20 font-sans normal-case`} />
        </label>
        <button
          type="button"
          data-testid="kit-form-submit"
          disabled={!formText.trim() || loading}
          onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              const res = await answerFormQuestions(jobId, formText);
              if (res.ok) setAnswers(res.answers);
              else setError(res.error);
            } catch {
              setError('failed');
            } finally {
              setLoading(false);
            }
          }}
          className="brutal brutal-press self-start px-3 py-1 text-sm font-semibold disabled:opacity-50"
        >
          {t('answerForm')}
        </button>
        {answers.map((a, i) => (
          <div key={`${i}-${a.question}`} data-testid="kit-answer" data-from-bank={a.fromBank} className="flex flex-col gap-1 border-l-4 border-border pl-3">
            <p className="text-sm font-semibold">{a.question}{a.fromBank && <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">{t('fromBank')}</span>}</p>
            <textarea value={a.answer} onChange={(e) => setAnswers((list) => list.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} className={`${field} min-h-14`} aria-label={a.question} />
            <div className="flex gap-2">
              <button type="button" onClick={() => void copy(`a${i}`, a.answer)} className="text-xs underline">{copied === `a${i}` ? `✓ ${t('copied')}` : t('copy')}</button>
              <button type="button" data-testid="kit-save-answer" onClick={() => void saveBankAnswer({ key: null, question: a.question, answer: a.answer, locale })} className="text-xs underline">{t('saveToBank')}</button>
            </div>
          </div>
        ))}
      </div>

      {data.jobUrl && (
        <a
          href={data.jobUrl}
          target="_blank"
          rel="noopener"
          data-testid="kit-apply"
          onClick={() => setAwaitingReturn(true)}
          className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground"
        >
          {t('apply')} ↗
        </a>
      )}
      {askApplied && (
        <div role="alertdialog" aria-label={t('didApply')} className="brutal flex items-center gap-3 p-3">
          <span className="font-semibold">{t('didApply')}</span>
          <button type="button" data-testid="kit-applied-yes" onClick={() => void confirmApplied(true)} className="brutal brutal-press bg-brand px-3 py-1 text-sm font-semibold text-brand-foreground">{t('yes')}</button>
          <button type="button" data-testid="kit-applied-no" onClick={() => void confirmApplied(false)} className="px-3 py-1 text-sm">{t('no')}</button>
        </div>
      )}
      {appliedState === 'done' && <p role="status" className="text-sm text-success">{t('appliedDone')}</p>}
      {appliedState === 'error' && <p role="alert" className="text-sm text-danger">{t('err_failed')}</p>}
    </section>
  );
}
```

- [ ] **Step 3: Подключить в ленте и на доске**

- `today/feed-types.ts`: `FeedMatch.jobId: string`. `today/page.tsx`: в select добавить `job_id`, в маппинг — `jobId: m.job_id`. Обновить фабрику `m()` в `feed-filter.test.ts` (`jobId: 'j-' + id`).
- `today/match-detail.tsx`: под кнопками действий — кнопка `apply-kit-open` («Набор отклика»), по клику раскрывает `<ApplyKitPanel jobId={match.jobId} locale={locale} />` (`locale` из `useLocale()` с проверкой `isLocale`, иначе `'en'`). Состояние «открыто» сбрасывается при смене `match.id` (через `key={match.id}` на обёртке).
- `board/board-types.ts`: `BoardCard.jobId: string | null`. `board/page.tsx`: select `job_id`, маппинг `jobId: a.job_id`. `createApplication` (ручная карточка) возвращает `jobId: null`.
- `board/card-panel.tsx`: если `card.jobId` — кнопка `apply-kit-open` и `<ApplyKitPanel jobId={card.jobId} locale={…} />` в панели.

- [ ] **Step 4: Сообщения** — объект `kit` во всех трёх локалях:

en: `"title": "Apply kit"`, `"open": "Apply kit"`, `"loading": "Loading…"`, `"language": "Letter language"`, `"lang_auto": "Job's language"`, `"lang_en": "English"`, `"lang_uk": "Ukrainian"`, `"lang_ru": "Russian"`, `"generate": "Generate"`, `"regenerate": "Regenerate"`, `"generating": "Writing…"`, `"shorter": "Shorter"`, `"formal": "More formal"`, `"requirements": "Requirements"`, `"letter": "Cover letter"`, `"copyLetter": "Copy letter"`, `"short": "Short message"`, `"copyShort": "Copy message"`, `"copied": "Copied"`, `"copy": "Copy"`, `"contacts": "Contacts"`, `"noContacts": "Add your contacts in Profile."`, `"contact_email": "Email"`, `"contact_phone": "Phone"`, `"contact_linkedin": "LinkedIn"`, `"contact_github": "GitHub"`, `"contact_portfolio": "Portfolio"`, `"contact_telegram": "Telegram"`, `"contact_cv": "CV link"`, `"formQuestions": "Questions from the application form"`, `"formPlaceholder": "Paste one question or the whole form"`, `"answerForm": "Answer"`, `"fromBank": "from bank"`, `"saveToBank": "Save to answer bank"`, `"apply": "Open and apply"`, `"didApply": "Did you apply?"`, `"yes": "Yes"`, `"no": "Not yet"`, `"appliedDone": "Moved to Applied."`, `"err_ai_unavailable": "AI for personal data is off (no paid private key)."`, `"err_no_cv": "Upload your CV in Profile to generate letters."`, `"err_not_found": "This job is no longer available."`, `"err_failed": "Couldn't generate. Try again."`.
uk: `"title": "Набір для відгуку"`, `"open": "Набір для відгуку"`, `"loading": "Завантаження…"`, `"language": "Мова листа"`, `"lang_auto": "Мова вакансії"`, `"lang_en": "Англійська"`, `"lang_uk": "Українська"`, `"lang_ru": "Російська"`, `"generate": "Згенерувати"`, `"regenerate": "Згенерувати знову"`, `"generating": "Пишу…"`, `"shorter": "Коротше"`, `"formal": "Формальніше"`, `"requirements": "Вимоги"`, `"letter": "Супровідний лист"`, `"copyLetter": "Копіювати лист"`, `"short": "Коротке повідомлення"`, `"copyShort": "Копіювати повідомлення"`, `"copied": "Скопійовано"`, `"copy": "Копіювати"`, `"contacts": "Контакти"`, `"noContacts": "Додайте контакти в профілі."`, `"contact_email": "Email"`, `"contact_phone": "Телефон"`, `"contact_linkedin": "LinkedIn"`, `"contact_github": "GitHub"`, `"contact_portfolio": "Портфоліо"`, `"contact_telegram": "Telegram"`, `"contact_cv": "Посилання на CV"`, `"formQuestions": "Питання з форми відгуку"`, `"formPlaceholder": "Вставте одне питання або всю форму"`, `"answerForm": "Відповісти"`, `"fromBank": "з банку"`, `"saveToBank": "Зберегти в банк відповідей"`, `"apply": "Відкрити й відгукнутися"`, `"didApply": "Відгукнулися?"`, `"yes": "Так"`, `"no": "Ще ні"`, `"appliedDone": "Перенесено у «Відгукнувся»."`, `"err_ai_unavailable": "AI для особистих даних вимкнено (немає платного приватного ключа)."`, `"err_no_cv": "Завантажте CV у профілі, щоб генерувати листи."`, `"err_not_found": "Ця вакансія вже недоступна."`, `"err_failed": "Не вдалося згенерувати. Спробуйте ще раз."`.
ru: `"title": "Набор отклика"`, `"open": "Набор отклика"`, `"loading": "Загрузка…"`, `"language": "Язык письма"`, `"lang_auto": "Язык вакансии"`, `"lang_en": "Английский"`, `"lang_uk": "Украинский"`, `"lang_ru": "Русский"`, `"generate": "Сгенерировать"`, `"regenerate": "Сгенерировать заново"`, `"generating": "Пишу…"`, `"shorter": "Короче"`, `"formal": "Формальнее"`, `"requirements": "Требования"`, `"letter": "Сопроводительное письмо"`, `"copyLetter": "Копировать письмо"`, `"short": "Короткое сообщение"`, `"copyShort": "Копировать сообщение"`, `"copied": "Скопировано"`, `"copy": "Копировать"`, `"contacts": "Контакты"`, `"noContacts": "Добавьте контакты в профиле."`, `"contact_email": "Email"`, `"contact_phone": "Телефон"`, `"contact_linkedin": "LinkedIn"`, `"contact_github": "GitHub"`, `"contact_portfolio": "Портфолио"`, `"contact_telegram": "Telegram"`, `"contact_cv": "Ссылка на CV"`, `"formQuestions": "Вопросы из формы отклика"`, `"formPlaceholder": "Вставьте один вопрос или всю форму"`, `"answerForm": "Ответить"`, `"fromBank": "из банка"`, `"saveToBank": "Сохранить в банк ответов"`, `"apply": "Открыть и откликнуться"`, `"didApply": "Откликнулись?"`, `"yes": "Да"`, `"no": "Ещё нет"`, `"appliedDone": "Перенесено в «Откликнулся»."`, `"err_ai_unavailable": "AI для личных данных выключен (нет платного приватного ключа)."`, `"err_no_cv": "Загрузите CV в профиле, чтобы генерировать письма."`, `"err_not_found": "Эта вакансия уже недоступна."`, `"err_failed": "Не удалось сгенерировать. Попробуйте ещё раз."`.

- [ ] **Step 5: E2E**

`helpers/seed.ts` — добавить `seedCv(email)` (через admin-клиент: загрузить `fixtures/cv.pdf` в `resumes/<uid>/<uuid>.pdf` и вставить строку `resumes` с `parsed` = нормализованный канонический ответ fake-провайдера: `import { normalizeCv } from '@jp/ai'` и `import { fakeResponder } from '@jp/ai/testing'` → `normalizeCv(fakeResponder({ task: 'parse_cv' } as never) as never)`), и `seedBankAnswer(email, key, answerEn)`.

`apps/web/e2e/apply-kit.spec.ts`:
```ts
import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedBankAnswer, seedCv, seedMatch } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

async function openKit(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole('button', { name: 'Details' }).click();
  await visible(page, 'apply-kit-open').click();
}

test('generates the apply kit, answers form questions from the bank and AI, marks applied', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit');
  await loginAs(context, email);
  await seedCv(email);
  await seedBankAnswer(email, 'salary', '$4000–4500 per month');
  const { title } = await seedMatch(email, { score: 90 });
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await visible(page, 'kit-generate').click();
  await expect(visible(page, 'kit-letter')).toHaveValue(/full stack developer/i);
  await expect(visible(page, 'kit-requirement').filter({ hasText: 'Kubernetes' })).toHaveAttribute('data-status', 'missing');
  await expect(visible(page, 'kit-red-flag')).toContainText('Unpaid trial');
  await expect(visible(page, 'kit-short')).toContainText('[fake]');
  await expect(visible(page, 'contact-chip').filter({ hasText: 'CV link' })).toBeVisible();

  await visible(page, 'kit-form-input').fill('1. What are your salary expectations?\n2. Do you have Kubernetes experience?');
  await visible(page, 'kit-form-submit').click();
  await expect(visible(page, 'kit-answer').first()).toHaveAttribute('data-from-bank', 'true');
  await expect(visible(page, 'kit-answer').first().getByRole('textbox')).toHaveValue('$4000–4500 per month');
  await expect(visible(page, 'kit-answer').nth(1).getByRole('textbox')).toHaveValue('Fake answer 1');

  const popup = context.waitForEvent('page');
  await visible(page, 'kit-apply').click();
  const tab = await popup;
  await tab.close();
  await page.bringToFront();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await visible(page, 'kit-applied-yes').click();
  await expect(page.getByText('Moved to Applied.').filter({ visible: true })).toBeVisible();
  await page.goto('/en/board');
  await expect(page.locator('[data-testid="board-column"][data-column-key="applied"]').getByText(title)).toBeVisible();
});

test('without a CV the kit explains what to do', async ({ context, page, isMobile }) => {
  const email = uniqueEmail('kit-nocv');
  await loginAs(context, email);
  await seedMatch(email, { score: 88 });
  await page.goto('/en/today');
  await openKit(page, isMobile);
  await expect(visible(page, 'kit-error')).toContainText('Upload your CV');
  await expect(visible(page, 'kit-generate')).toBeDisabled();
});
```
(Если заголовок с job-postings URL у `seedMatch` — `jobs.dou.ua/...`, `kit-apply` открывает его во вкладке; закрытие вкладки до загрузки допустимо.)

- [ ] **Step 6: Проверка и commit**

Run: `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
```bash
git add apps/web
git commit -m "feat(web): apply kit — requirements, letter, short message, form answers, contacts, applied flow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: «Написать рекрутеру» на карточке доски

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/board/{recruiter-message.tsx,message-actions.ts}`, `apps/web/e2e/recruiter.spec.ts`
- Modify: `apps/web/src/app/[locale]/(app)/board/card-panel.tsx`, `apps/web/messages/{en,uk,ru}.json`

**Interfaces:**
- Consumes: `recruiterMessage`, `MESSAGE_FORMATS`, `MESSAGE_LIMITS`, `type MessageFormat` (`@jp/ai`); `getLlm`, `privateAiAvailable`, `loadPrimaryCv`; таблицы `application_messages`, `applications`, событие `message`.
- Produces:
  - Server actions (`message-actions.ts`): `generateRecruiterMessage(applicationId: string, opts: { format: MessageFormat; kind: 'intro' | 'follow_up'; lang: 'en'|'uk'|'ru'; tone: 'default'|'shorter'|'formal' }): Promise<{ ok: true; subject: string | null; body: string } | { ok: false; error: 'ai_unavailable' | 'no_cv' | 'not_found' | 'failed' }>`; `logSentMessage(applicationId: string, channel: 'email'|'linkedin'|'telegram'|'other', body: string): Promise<boolean>` (вставка `application_messages` direction `out`, `last_activity_at = now()`, `follow_up_count + 1` для follow-up не нужен — только активность; событие `message`); `listMessages(applicationId: string): Promise<{ direction: 'in'|'out'; channel: string; body: string; sentAt: string }[]>`.
  - Test ids: `recruiter-message`, `msg-format`, `msg-kind`, `msg-lang`, `msg-generate`, `msg-body`, `msg-count`, `msg-copy`, `msg-sent`, `msg-error`, `msg-item`.

- [ ] **Step 1: Server actions**

`board/message-actions.ts`:
```ts
'use server';

import { MESSAGE_FORMATS, type MessageFormat, recruiterMessage } from '@jp/ai';
import { revalidatePath } from 'next/cache';
import { getLlm, privateAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateRecruiterMessage(
  applicationId: string,
  opts: { format: MessageFormat; kind: 'intro' | 'follow_up'; lang: 'en' | 'uk' | 'ru'; tone: 'default' | 'shorter' | 'formal' },
): Promise<{ ok: true; subject: string | null; body: string } | { ok: false; error: 'ai_unavailable' | 'no_cv' | 'not_found' | 'failed' }> {
  if (!(await getUserId()) || !UUID.test(applicationId) || !MESSAGE_FORMATS.includes(opts.format) || !['intro', 'follow_up'].includes(opts.kind) || !['en', 'uk', 'ru'].includes(opts.lang) || !['default', 'shorter', 'formal'].includes(opts.tone)) {
    return { ok: false, error: 'not_found' };
  }
  if (!privateAiAvailable()) return { ok: false, error: 'ai_unavailable' };
  const supabase = await createClient();
  const [{ data: app }, cv, { data: previous }] = await Promise.all([
    supabase.from('applications').select('title, company, contact, jobs(description_text)').eq('id', applicationId).maybeSingle(),
    loadPrimaryCv(supabase),
    supabase.from('application_messages').select('body').eq('application_id', applicationId).eq('direction', 'out').order('sent_at').limit(5),
  ]);
  if (!app) return { ok: false, error: 'not_found' };
  if (!cv?.parsed) return { ok: false, error: 'no_cv' };
  const contact = (app.contact ?? {}) as { name?: unknown };
  try {
    const res = await recruiterMessage(getLlm(), {
      format: opts.format,
      kind: opts.kind,
      job: { title: app.title, company: app.company, description: app.jobs?.description_text ?? null },
      cv: cv.parsed,
      recruiterName: typeof contact.name === 'string' ? contact.name : null,
      lang: opts.lang,
      tone: opts.tone,
      previous: (previous ?? []).map((p) => p.body),
    });
    return { ok: true, ...res };
  } catch (err) {
    console.error('generateRecruiterMessage failed', err instanceof Error ? err.message : err);
    return { ok: false, error: 'failed' };
  }
}

export async function logSentMessage(applicationId: string, channel: 'email' | 'linkedin' | 'telegram' | 'other', body: string): Promise<boolean> {
  const userId = await getUserId();
  const text = body.trim().slice(0, 10_000);
  if (!userId || !UUID.test(applicationId) || !['email', 'linkedin', 'telegram', 'other'].includes(channel) || !text) return false;
  const supabase = await createClient();
  const { error } = await supabase.from('application_messages').insert({ application_id: applicationId, user_id: userId, direction: 'out', channel, body: text });
  if (error) return false;
  const { data } = await supabase.from('applications').update({ last_activity_at: new Date().toISOString() }).eq('id', applicationId).select('id');
  await supabase.from('application_events').insert({ application_id: applicationId, user_id: userId, type: 'message', payload: { direction: 'out', channel } });
  revalidatePath('/[locale]/board', 'page');
  return (data?.length ?? 0) > 0;
}

export async function listMessages(applicationId: string) {
  if (!(await getUserId()) || !UUID.test(applicationId)) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('application_messages').select('direction, channel, body, sent_at').eq('application_id', applicationId).order('sent_at', { ascending: false }).limit(50);
  return (data ?? []).map((m) => ({ direction: m.direction as 'in' | 'out', channel: m.channel, body: m.body, sentAt: m.sent_at }));
}

```
(Файл с `'use server'` экспортирует только async-функции — константы держим в компонентах.)

- [ ] **Step 2: Компонент**

`board/recruiter-message.tsx`:
```tsx
'use client';

import { MESSAGE_FORMATS, MESSAGE_LIMITS, type MessageFormat } from '@jp/ai';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { generateRecruiterMessage, listMessages, logSentMessage } from './message-actions';

const CHANNEL: Record<MessageFormat, 'linkedin' | 'telegram' | 'email'> = { linkedin_note: 'linkedin', inmail: 'linkedin', telegram: 'telegram', email: 'email' };

export function RecruiterMessage({ applicationId, defaultLang, onSent }: { applicationId: string; defaultLang: 'en' | 'uk' | 'ru'; onSent: () => void }) {
  const t = useTranslations('recruiter');
  const format = useFormatter();
  const now = useNow();
  const [fmt, setFmt] = useState<MessageFormat>('linkedin_note');
  const [kind, setKind] = useState<'intro' | 'follow_up'>('intro');
  const [lang, setLang] = useState(defaultLang);
  const [subject, setSubject] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [history, setHistory] = useState<{ direction: string; channel: string; body: string; sentAt: string }[]>([]);

  useEffect(() => {
    void listMessages(applicationId).then((h) => {
      setHistory(h);
      if (h.some((m) => m.direction === 'out')) setKind('follow_up');
    });
  }, [applicationId]);

  const field = 'brutal bg-card px-2 py-1 text-sm';
  const limit = MESSAGE_LIMITS[fmt];

  return (
    <section data-testid="recruiter-message" className="flex flex-col gap-3 border-t-2 border-border pt-3">
      <h3 className="font-mono text-xs uppercase">{t('title')}</h3>
      <div className="flex flex-wrap gap-2">
        <select data-testid="msg-format" aria-label={t('format')} value={fmt} onChange={(e) => setFmt(e.target.value as MessageFormat)} className={field}>
          {MESSAGE_FORMATS.map((f) => <option key={f} value={f}>{t(`format_${f}`)}</option>)}
        </select>
        <select data-testid="msg-kind" aria-label={t('kind')} value={kind} onChange={(e) => setKind(e.target.value as 'intro' | 'follow_up')} className={field}>
          <option value="intro">{t('intro')}</option>
          <option value="follow_up">{t('followUp')}</option>
        </select>
        <select data-testid="msg-lang" aria-label={t('lang')} value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'uk' | 'ru')} className={field}>
          {(['en', 'uk', 'ru'] as const).map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
        </select>
        <button
          type="button"
          data-testid="msg-generate"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            setSent(false);
            try {
              const res = await generateRecruiterMessage(applicationId, { format: fmt, kind, lang, tone: 'default' });
              if (res.ok) {
                setSubject(res.subject);
                setBody(res.body);
              } else setError(res.error);
            } catch {
              setError('failed');
            } finally {
              setBusy(false);
            }
          }}
          className="brutal brutal-press bg-ai px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? t('writing') : t('generate')}
        </button>
      </div>
      {error && <p data-testid="msg-error" role="alert" className="text-sm text-danger">{t(`err_${error}`)}</p>}
      {subject && <p className="text-sm"><span className="font-semibold">{t('subject')}:</span> {subject}</p>}
      <textarea data-testid="msg-body" value={body} maxLength={limit} onChange={(e) => setBody(e.target.value)} aria-label={t('body')} className={`${field} min-h-28`} />
      <p data-testid="msg-count" className="font-mono text-xs text-muted-foreground">{body.length} / {limit}</p>
      <div className="flex gap-2">
        <button type="button" data-testid="msg-copy" disabled={!body} onClick={() => void navigator.clipboard.writeText(subject ? `${subject}\n\n${body}` : body).catch(() => undefined)} className="brutal brutal-press px-3 py-1 text-sm font-semibold disabled:opacity-50">{t('copy')}</button>
        <button
          type="button"
          data-testid="msg-sent"
          disabled={!body.trim() || sent}
          onClick={async () => {
            try {
              const ok = await logSentMessage(applicationId, CHANNEL[fmt], subject ? `${subject}\n\n${body}` : body);
              if (!ok) return setError('failed');
              setSent(true);
              setKind('follow_up');
              setHistory(await listMessages(applicationId));
              onSent();
            } catch {
              setError('failed');
            }
          }}
          className="brutal brutal-press bg-brand px-3 py-1 text-sm font-semibold text-brand-foreground disabled:opacity-50"
        >
          {sent ? `✓ ${t('logged')}` : t('sent')}
        </button>
      </div>
      {history.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {history.map((m, i) => (
            <li key={i} data-testid="msg-item" className="border-l-4 border-border pl-2">
              <span className="font-mono text-xs uppercase text-muted-foreground">{t(m.direction === 'out' ? 'outgoing' : 'incoming')} · {m.channel} · <span suppressHydrationWarning>{format.relativeTime(new Date(m.sentAt), now)}</span></span>
              <p className="line-clamp-3 whitespace-pre-line">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

`card-panel.tsx` — добавить `<RecruiterMessage applicationId={card.id} defaultLang={locale} onSent={() => onChanged({ lastActivityAt: new Date().toISOString() })} />` (locale из `useLocale()` с `isLocale`-фолбэком `'en'`).

- [ ] **Step 3: Сообщения** — объект `recruiter` во всех трёх локалях:

en: `"title": "Write to the recruiter"`, `"format": "Format"`, `"kind": "Message type"`, `"lang": "Language"`, `"format_linkedin_note": "LinkedIn note (300)"`, `"format_inmail": "InMail"`, `"format_telegram": "Telegram"`, `"format_email": "Email"`, `"intro": "First message"`, `"followUp": "Follow-up"`, `"generate": "Write"`, `"writing": "Writing…"`, `"subject": "Subject"`, `"body": "Message"`, `"copy": "Copy"`, `"sent": "I sent it ✓"`, `"logged": "Logged"`, `"outgoing": "Sent"`, `"incoming": "Received"`, `"err_ai_unavailable": "AI for personal data is off (no paid private key)."`, `"err_no_cv": "Upload your CV in Profile first."`, `"err_not_found": "Card not found."`, `"err_failed": "Couldn't write the message. Try again."`.
uk: `"title": "Написати рекрутеру"`, `"format": "Формат"`, `"kind": "Тип повідомлення"`, `"lang": "Мова"`, `"format_linkedin_note": "LinkedIn note (300)"`, `"format_inmail": "InMail"`, `"format_telegram": "Telegram"`, `"format_email": "Email"`, `"intro": "Перше повідомлення"`, `"followUp": "Нагадування"`, `"generate": "Написати"`, `"writing": "Пишу…"`, `"subject": "Тема"`, `"body": "Повідомлення"`, `"copy": "Копіювати"`, `"sent": "Я надіслав ✓"`, `"logged": "Записано"`, `"outgoing": "Надіслано"`, `"incoming": "Отримано"`, `"err_ai_unavailable": "AI для особистих даних вимкнено (немає платного приватного ключа)."`, `"err_no_cv": "Спочатку завантажте CV у профілі."`, `"err_not_found": "Картку не знайдено."`, `"err_failed": "Не вдалося написати повідомлення. Спробуйте ще раз."`.
ru: `"title": "Написать рекрутеру"`, `"format": "Формат"`, `"kind": "Тип сообщения"`, `"lang": "Язык"`, `"format_linkedin_note": "LinkedIn note (300)"`, `"format_inmail": "InMail"`, `"format_telegram": "Telegram"`, `"format_email": "Email"`, `"intro": "Первое сообщение"`, `"followUp": "Напоминание"`, `"generate": "Написать"`, `"writing": "Пишу…"`, `"subject": "Тема"`, `"body": "Сообщение"`, `"copy": "Копировать"`, `"sent": "Я отправил ✓"`, `"logged": "Записано"`, `"outgoing": "Отправлено"`, `"incoming": "Получено"`, `"err_ai_unavailable": "AI для личных данных выключен (нет платного приватного ключа)."`, `"err_no_cv": "Сначала загрузите CV в профиле."`, `"err_not_found": "Карточка не найдена."`, `"err_failed": "Не удалось написать сообщение. Попробуйте ещё раз."`.
Плюс в `board`: `"event_message": "Message sent"` (en), `"Надіслано повідомлення"` (uk), `"Отправлено сообщение"` (ru).

- [ ] **Step 4: E2E** — `apps/web/e2e/recruiter.spec.ts`:
```ts
import { expect, type Page, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';
import { seedApplication, seedCv } from './helpers/seed';

const visible = (page: Page, id: string) => page.getByTestId(id).filter({ visible: true });

test('writes a LinkedIn note, logs it as sent and switches to follow-up', async ({ context, page }) => {
  const email = uniqueEmail('recruiter');
  await loginAs(context, email);
  await seedCv(email);
  const { title } = await seedApplication(email, { column: 'applied', appliedDaysAgo: 8 });
  await page.goto('/en/board');
  await visible(page, 'board-card').filter({ hasText: title }).click();
  await visible(page, 'msg-generate').click();
  await expect(visible(page, 'msg-body')).toHaveValue(/\[fake\]/);
  await expect(visible(page, 'msg-count')).toContainText('/ 300');
  await visible(page, 'msg-sent').click();
  await expect(visible(page, 'msg-item')).toContainText('Sent');
  await expect(visible(page, 'msg-kind')).toHaveValue('follow_up');
  await expect(visible(page, 'panel-history')).toContainText('Message sent');
  await page.reload();
  await expect(visible(page, 'board-card').filter({ hasText: title }).getByTestId('card-urgency')).toHaveCount(0);
});

test('explains that a CV is needed', async ({ context, page }) => {
  const email = uniqueEmail('recruiter-nocv');
  await loginAs(context, email);
  const { title } = await seedApplication(email, { column: 'saved' });
  await page.goto('/en/board');
  await visible(page, 'board-card').filter({ hasText: title }).click();
  await visible(page, 'msg-generate').click();
  await expect(visible(page, 'msg-error')).toContainText('Upload your CV');
});
```
(Последняя проверка: отклик 8 дней назад был `ping`; после «Я надіслав» `last_activity_at = now()` → `fresh`, бейдж пропадает.)

- [ ] **Step 5: Проверка и commit**

Run: `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
```bash
git add apps/web
git commit -m "feat(web): AI recruiter messages on board cards with sent-message history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Документация и полный прогон

- [ ] **Step 1:** Роадмап: строка Плана 6 — статус `6a ✅ PR #8; 6b (Telegram, дайджест, карточки из скриншотов) — следующий`.
- [ ] **Step 2:** Спека, раздел 12.4 — дописать строку: «Реализация 6a: CV (PDF) в приватном bucket, разбор/письма/ответы/сообщения только через приватный ключ; набор отклика генерируется по кнопке и кэшируется в `apply_kits`; предгенерация для score ≥ 70 отложена (стоимость приватного ключа).»
- [ ] **Step 3:** Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
- [ ] **Step 4: Commit**
```bash
git add docs
git commit -m "docs: plan 6a status

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
