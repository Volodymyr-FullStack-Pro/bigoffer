# План 8 — Деплой (Vercel + Supabase Cloud + Trigger.dev Cloud): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Підготувати BigOffer до роботи 24/7 у хмарі: денний ліміт платного AI на користувача, завантаження CV, сумісне з лімітом тіла запиту Vercel, автодеплой міграцій і задач парсера при злитті в `main`, покрокова інструкція для власника.

**Architecture:** Vercel сам деплоїть `apps/web` з `main`. Новий workflow `deploy.yml` на `main` накочує міграції в Supabase Cloud (`supabase db push`), потім деплоїть задачі в Trigger.dev Cloud. Ліміт приватного AI — SQL-функція `consume_private_ai` (атомарний лічильник на користувача за UTC-добу), яку сервер викликає перед кожним приватним викликом LLM. CV браузер кладе прямо в Storage, сервер лише перевіряє й реєструє файл.

**Tech Stack:** Next.js 16, Supabase (Postgres, Storage, pgTAP), Trigger.dev 4.6.4, GitHub Actions, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-deploy-design.md`

## Global Constraints

- Всі Global Constraints попередніх планів (TS 6.0.3, `@jp/`, revoke → grant → RLS, лише нові міграції, Zod на межах, messages en/uk/ru з однаковими ключами, коміти закінчуються `Co-Authored-By: …`, без `minimumReleaseAgeExclude`, без нових залежностей).
- Ліміт: `PRIVATE_AI_DAILY_LIMIT`, за замовчуванням **100** запитів на користувача на UTC-добу; рахуються спроби (до виклику LLM).
- Понад ліміт LLM **не викликається**; дії повертають помилку `ai_limit`.
- Публічний AI (вакансії) цим лімітом не обмежується.
- Секрети — лише в налаштуваннях сервісів і GitHub Secrets; у репозиторії тільки назви змінних.
- Прод деплоїть власник злиттям `develop → main`; агент не пушить у `main`/`develop` і не запускає деплой.
- Локальну БД ніколи не скидати (`supabase db reset` заборонено).

## Структура файлів

```
supabase/migrations/20261011000100_private_ai_quota.sql
supabase/tests/database/009_private_ai_quota.test.sql
packages/db/src/database.types.ts                         (regen)
apps/web/src/lib/ai.ts                                    + consumePrivateAi()
apps/web/src/lib/ai.test.ts                               + тести ліміту
apps/web/src/components/apply-kit/actions.ts              ліміт у generateKit, answerFormQuestions
apps/web/src/app/[locale]/(app)/board/message-actions.ts  ліміт у generateRecruiterMessage
apps/web/src/app/[locale]/(app)/profile/cv-actions.ts     registerCv(path, fileName) замість uploadCv(FormData); ліміт перед parseCv
apps/web/src/app/[locale]/(app)/profile/cv-section.tsx    пряме завантаження в Storage
apps/web/messages/{en,uk,ru}.json                         err_ai_limit, cv.aiLimit
apps/web/e2e/{apply-kit,cv}.spec.ts, e2e/helpers/seed.ts  тести
apps/web/.env.example                                     PRIVATE_AI_DAILY_LIMIT
.github/workflows/deploy.yml
docs/deploy.md, README.md
```

---

### Task 1: БД — лічильник приватного AI

**Files:**
- Create: `supabase/migrations/20261011000100_private_ai_quota.sql`, `supabase/tests/database/009_private_ai_quota.test.sql`
- Modify: `packages/db/src/database.types.ts` (regen)

**Interfaces:**
- Produces: таблиця `public.ai_user_usage(user_id uuid, day date, requests int)`; RPC `consume_private_ai(p_limit int) returns boolean` — для `authenticated`; лічить для `auth.uid()` за `(now() at time zone 'utc')::date`; `true` — запит дозволено (лічильник збільшено), `false` — ліміт вичерпано (лічильник не змінено); без користувача → `false`.

- [ ] **Step 1: Падаючий pgTAP** — `supabase/tests/database/009_private_ai_quota.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000a1001', 'quota1@test.local'), ('00000000-0000-0000-0000-0000000a1002', 'quota2@test.local');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1001","role":"authenticated"}', true);

select is(public.consume_private_ai(2), true, 'first call allowed');
select is(public.consume_private_ai(2), true, 'second call allowed');
select is(public.consume_private_ai(2), false, 'third call over the limit');
select throws_ok($$ select * from public.ai_user_usage $$, '42501', null, 'table is not readable by users');
select throws_ok($$ update public.ai_user_usage set requests = 0 $$, '42501', null, 'users cannot reset the counter');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000a1002","role":"authenticated"}', true);
select is(public.consume_private_ai(2), true, 'limits are per user');

reset role;
select is((select requests from public.ai_user_usage where user_id = '00000000-0000-0000-0000-0000000a1001'), 2, 'over-limit call did not count');

select * from finish();
rollback;
```
Run: `supabase test db` → FAIL (функції немає).

- [ ] **Step 2: Міграція** — `supabase/migrations/20261011000100_private_ai_quota.sql`:
```sql
-- Plan 8: per-user daily cap on paid (private) AI calls. Counts attempts, checked before the LLM call.
create table public.ai_user_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests int not null default 0 check (requests >= 0),
  primary key (user_id, day)
);
revoke all on public.ai_user_usage from anon, authenticated;
alter table public.ai_user_usage enable row level security;

-- Security definer: users have no table rights; the function only ever touches the caller's own row (auth.uid()),
-- so calling it directly can only spend the caller's own quota. The LLM call itself happens server-side.
create or replace function public.consume_private_ai(p_limit int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'utc')::date;
  v_requests int;
begin
  if v_user is null or p_limit is null or p_limit <= 0 then
    return false;
  end if;
  insert into public.ai_user_usage as u (user_id, day, requests)
  values (v_user, v_day, 1)
  on conflict (user_id, day) do update set requests = u.requests + 1
    where u.requests < p_limit
  returning requests into v_requests;
  return v_requests is not null;
end;
$$;
revoke execute on function public.consume_private_ai(int) from public, anon;
grant execute on function public.consume_private_ai(int) to authenticated;
```
(Перша вставка за добу дає `requests = 1`; за `p_limit = 1` наступний виклик уже `false`. Конфлікт без оновлення повертає 0 рядків → `v_requests is null` → `false`.)

- [ ] **Step 3:** `supabase migration up --local && supabase test db` → PASS; `pnpm db:types && pnpm typecheck` → PASS.

- [ ] **Step 4: Commit**
```bash
git add supabase packages/db
git commit -m "feat(db): per-user daily cap on private AI calls"
```

---

### Task 2: Веб — ліміт перед кожним приватним викликом AI

**Files:**
- Modify: `apps/web/src/lib/ai.ts`, `apps/web/src/lib/ai.test.ts`, `apps/web/src/components/apply-kit/actions.ts`, `apps/web/src/app/[locale]/(app)/board/message-actions.ts`, `apps/web/src/app/[locale]/(app)/profile/cv-actions.ts`, компоненти, що показують помилки kit/recruiter/cv (знайти за `err_ai_unavailable` і `t('aiUnavailable')`), `apps/web/messages/{en,uk,ru}.json`, `apps/web/.env.example`, `apps/web/e2e/apply-kit.spec.ts`, `apps/web/e2e/helpers/seed.ts`

**Interfaces:**
- Consumes: RPC `consume_private_ai(p_limit int): boolean` (Task 1).
- Produces: `privateAiDailyLimit(env?): number` і `consumePrivateAi(supabase): Promise<boolean>` у `@/lib/ai`; новий код помилки `'ai_limit'` у `KitError` і в результаті `generateRecruiterMessage`; стан CV `{ status: 'stored', message: 'ai_limit' }`.

- [ ] **Step 1: Падаючі unit-тести** — у `apps/web/src/lib/ai.test.ts` додати:
```ts
describe('private AI quota', () => {
  it('reads the daily limit from env with a default of 100', async () => {
    const { privateAiDailyLimit } = await import('./ai');
    expect(privateAiDailyLimit({})).toBe(100);
    expect(privateAiDailyLimit({ PRIVATE_AI_DAILY_LIMIT: '30' })).toBe(30);
    expect(privateAiDailyLimit({ PRIVATE_AI_DAILY_LIMIT: 'nope' })).toBe(100);
    expect(privateAiDailyLimit({ PRIVATE_AI_DAILY_LIMIT: '0' })).toBe(0);
  });
  it('asks the database to consume one request and fails closed on errors', async () => {
    const { consumePrivateAi } = await import('./ai');
    const calls: unknown[] = [];
    const ok = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: true, error: null }; } };
    expect(await consumePrivateAi(ok as never)).toBe(true);
    expect(calls).toEqual([['consume_private_ai', { p_limit: 100 }]]);
    const over = { rpc: async () => ({ data: false, error: null }) };
    expect(await consumePrivateAi(over as never)).toBe(false);
    const broken = { rpc: async () => ({ data: null, error: { message: 'boom' } }) };
    expect(await consumePrivateAi(broken as never)).toBe(false);
  });
});
```
(Підлаштувати під існуючу структуру `ai.test.ts` — там уже мокається `server-only`. Якщо env процесу тесту містить `PRIVATE_AI_DAILY_LIMIT`, тест очікувань `p_limit: 100` має явно передавати/очищати env.)
Run: `pnpm --filter @jp/web test -- ai` → FAIL.

- [ ] **Step 2: Хелпер** — у `apps/web/src/lib/ai.ts`:
```ts
const DEFAULT_PRIVATE_AI_DAILY_LIMIT = 100;

/** Paid-AI requests one user may make per UTC day (PRIVATE_AI_DAILY_LIMIT, default 100). */
export function privateAiDailyLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.PRIVATE_AI_DAILY_LIMIT;
  if (raw === undefined || raw === '') return DEFAULT_PRIVATE_AI_DAILY_LIMIT;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_PRIVATE_AI_DAILY_LIMIT;
}

/** Spends one paid-AI request of the signed-in user's daily quota; false = over the limit (or the check failed). */
export async function consumePrivateAi(supabase: { rpc: (fn: 'consume_private_ai', args: { p_limit: number }) => PromiseLike<{ data: boolean | null; error: unknown }> }): Promise<boolean> {
  const { data, error } = await supabase.rpc('consume_private_ai', { p_limit: privateAiDailyLimit() });
  if (error) {
    console.error('private AI quota check failed');
    return false;
  }
  return data === true;
}
```
(Тип параметра підігнати так, щоб приймався клієнт `createClient()` з `@/lib/supabase/server` без `as`; якщо простіше — `SupabaseClient<Database>`.)

- [ ] **Step 3: Виклики** — одразу **перед** кожним викликом LLM (після всіх перевірок доступу й наявності CV, щоб невдалі ранні виходи не витрачали ліміт):
- `generateKit`: перед `generateApplyKit(...)` → `if (!(await consumePrivateAi(supabase))) return { ok: false, error: 'ai_limit' };` і додати `'ai_limit'` у тип `KitError`.
- `answerFormQuestions`: усередині гілки `missing.length > 0`, перед `answerForm(...)` — те саме.
- `generateRecruiterMessage`: перед `recruiterMessage(...)` — те саме; додати `'ai_limit'` у тип помилки.
- CV (`cv-actions.ts`): перед `parseCv(...)` — якщо ліміт вичерпано, записати `parse_error: 'ai_limit'` у рядок резюме і повернути `{ status: 'stored', message: 'ai_limit' }`; додати `'ai_limit'` у тип `CvState['message']`.

- [ ] **Step 4: Повідомлення** — у кожному місці UI, де показується `err_ai_unavailable` (namespaces `kit` і `recruiter`), додати ключ `err_ai_limit`; у `cv` — `aiLimit`; показ у компонентах так само, як для `ai_unavailable` (той самий механізм мапінгу коду помилки на ключ).
  - en: `"err_ai_limit": "Today's AI limit is used up. It resets at 00:00 UTC (03:00 Kyiv)."`, `cv.aiLimit`: `"CV saved. Today's AI limit is used up — it will be read after 00:00 UTC (03:00 Kyiv); upload again then."`
  - uk: `"err_ai_limit": "Денний ліміт AI вичерпано. Оновиться о 00:00 UTC (03:00 за Києвом)."`, `cv.aiLimit`: `"CV збережено. Денний ліміт AI вичерпано — завантажте ще раз після 00:00 UTC (03:00 за Києвом)."`
  - ru: `"err_ai_limit": "Дневной лимит AI исчерпан. Обновится в 00:00 UTC (03:00 по Киеву)."`, `cv.aiLimit`: `"CV сохранено. Дневной лимит AI исчерпан — загрузите снова после 00:00 UTC (03:00 по Киеву)."`
  - `apps/web/.env.example`: після `AI_MODEL_PRIVATE=` додати
    ```
    # Paid-AI requests per user per UTC day (CV parsing, letters, form answers, recruiter messages). Default 100.
    PRIVATE_AI_DAILY_LIMIT=
    ```

- [ ] **Step 5: E2E** — `helpers/seed.ts`: `exhaustPrivateAi(userId: string)` — admin-клієнтом upsert `ai_user_usage` `{ user_id, day: <UTC сьогодні YYYY-MM-DD>, requests: 1000 }`. `apply-kit.spec.ts`: новий тест — користувач з CV і матчем, ліміт вичерпано → натискання «згенерувати» показує текст `err_ai_limit` (у локалі тесту); листа не з'являється. Чистка — разом із користувачем (FK `on delete cascade`).

- [ ] **Step 6:** `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e -- apply-kit recruiter cv` → PASS (desktop + mobile).

- [ ] **Step 7: Commit**
```bash
git add apps/web
git commit -m "feat(web): enforce the daily private-AI limit before every paid AI call"
```

---

### Task 3: Веб — пряме завантаження CV у Storage

**Files:**
- Modify: `apps/web/src/app/[locale]/(app)/profile/cv-actions.ts`, `apps/web/src/app/[locale]/(app)/profile/cv-section.tsx`, `apps/web/e2e/cv.spec.ts` (і `onboarding.spec.ts`, якщо він завантажує CV)

**Interfaces:**
- Consumes: `consumePrivateAi` (Task 2), браузерний клієнт `createBrowserSupabase()` (`@/lib/supabase/browser`), бакет `resumes` (ліміт 5 МБ, лише `application/pdf`, політика insert лише в папку `auth.uid()`).
- Produces: server action `registerCv(path: string, originalName: string): Promise<CvState>` замість `uploadCv(prev, FormData)`; `CvState` без змін (+ `'ai_limit'` з Task 2).

- [ ] **Step 1: E2E спершу** — `cv.spec.ts` уже перевіряє завантаження PDF, «не PDF» і «завеликий». Додати перевірку, що запит server action не несе тіла файлу: завантаження файлу 4.8 МБ (валідний PDF-заголовок + доповнення) проходить і показує `parsed`/`stored` (на Vercel це впало б на 4.5 МБ). Запустити → тест на 4.8 МБ має пройти і зараз локально; він фіксує поведінку.

- [ ] **Step 2: Клієнт** — `cv-section.tsx`: замість `<form action={action}>` з `useActionState(uploadCv)` — обробник `onSubmit`:
  1. взяти файл з інпуту; клієнтська перевірка: тип `application/pdf` або ім'я `.pdf`, розмір ≤ 5 МБ — інакше стан `invalid` (`not_pdf` / `too_big`) без запитів;
  2. `const supabase = createBrowserSupabase(); const { data: { user } } = await supabase.auth.getUser();` — без користувача стан `error`;
  3. `const path = \`${user.id}/${crypto.randomUUID()}.pdf\`;` `await supabase.storage.from('resumes').upload(path, file, { contentType: 'application/pdf' })` — помилка Storage з `413`/`Payload too large` → `invalid/too_big`, інша → `error`;
  4. `setState(await registerCv(path, file.name))` у `startTransition`; `pending` — поки триває будь-який крок.
  Розмітка, `data-testid` і тексти лишаються як були.

- [ ] **Step 3: Сервер** — `cv-actions.ts`: `registerCv(path, originalName)`:
```ts
const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i;

export async function registerCv(path: string, originalName: string): Promise<CvState> {
  const userId = await getUserId();
  if (!userId) return { status: 'error' };
  if (typeof path !== 'string' || !PATH.test(path) || !path.startsWith(`${userId}/`)) return { status: 'invalid', message: 'not_pdf' };
  const supabase = await createClient();
  const { data: blob, error: downloadError } = await supabase.storage.from('resumes').download(path);
  if (downloadError || !blob) return { status: 'error' };
  const bytes = Buffer.from(await blob.arrayBuffer());
  const reject = async (message: 'not_pdf' | 'too_big'): Promise<CvState> => {
    await supabase.storage.from('resumes').remove([path]);
    return { status: 'invalid', message };
  };
  if (bytes.length > MAX_BYTES) return reject('too_big');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return reject('not_pdf');
  // …далі без змін відносно uploadCv: previous → demote → insert row (file_name з originalName, та сама санітизація) → cleanup → ліміт AI → parseCv
}
```
  Видалити `uploadCv` і завантаження файлу з сервера (`supabase.storage…upload(path, bytes…)`); решта логіки (відкат при помилці вставки, видалення попереднього CV, `revalidatePath`, `parse_error`) — та сама. `experimental.serverActions.bodySizeLimit` у `next.config.ts` повернути до дефолту (видалити рядок і коментар), бо файл більше не йде через server action.

- [ ] **Step 4:** `pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e -- cv onboarding profile` → PASS (desktop + mobile).

- [ ] **Step 5: Commit**
```bash
git add apps/web
git commit -m "feat(web): upload CVs straight to Storage so uploads fit Vercel's request limit"
```

---

### Task 4: CI-деплой і інструкція для власника

**Files:**
- Create: `.github/workflows/deploy.yml`, `docs/deploy.md`
- Modify: `README.md`, `docs/superpowers/plans/2026-10-01-roadmap.md`

- [ ] **Step 1: Workflow** — `.github/workflows/deploy.yml`:
```yaml
name: deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  migrate:
    runs-on: ubuntu-latest
    env:
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}
      SUPABASE_PROJECT_REF: ${{ secrets.SUPABASE_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v4
      - name: Check secrets
        run: |
          for v in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_REF; do
            if [ -z "${!v}" ]; then echo "::error::Missing GitHub secret $v (see docs/deploy.md)"; exit 1; fi
          done
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
      - run: supabase db push --password "$SUPABASE_DB_PASSWORD"

  trigger:
    needs: migrate
    runs-on: ubuntu-latest
    env:
      TRIGGER_ACCESS_TOKEN: ${{ secrets.TRIGGER_ACCESS_TOKEN }}
      TRIGGER_PROJECT_REF: ${{ vars.TRIGGER_PROJECT_REF }}
    steps:
      - uses: actions/checkout@v4
      - name: Check secrets
        run: |
          if [ -z "$TRIGGER_ACCESS_TOKEN" ]; then echo "::error::Missing GitHub secret TRIGGER_ACCESS_TOKEN (see docs/deploy.md)"; exit 1; fi
          if [ -z "$TRIGGER_PROJECT_REF" ]; then echo "::error::Missing GitHub variable TRIGGER_PROJECT_REF (see docs/deploy.md)"; exit 1; fi
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @jp/jobs exec trigger deploy
```
(Версії дій, `node-version-file`/`node-version` і спосіб установки pnpm узяти **точно як у `.github/workflows/ci.yml`**. Перевірити, що `trigger.config.ts` читає `TRIGGER_PROJECT_REF` з env — так, уже читає. Якщо `actionlint` доступний (`npx --yes actionlint` або бінарник) — прогнати; інакше перевірити YAML через `node -e "require('yaml')…"`, якщо `yaml` уже в залежностях, або `python3 -c 'import yaml'`.)

- [ ] **Step 2: `docs/deploy.md`** (українською, для власника, покроково з чекбоксами). Розділи:
  1. **Огляд** — схема (Vercel / Supabase Cloud / Trigger.dev Cloud / GitHub Actions), що безкоштовно і ліміти (Vercel Hobby — некомерційно; Supabase Free 500 МБ, засинає після 7 днів без активності; Trigger.dev Free $5 кредиту/міс, 10 розкладів, у нас 4).
  2. **Supabase Cloud** — створити проєкт (регіон Frankfurt `eu-central-1`), зберегти пароль БД; взяти Project URL, publishable key, secret key, project ref; Authentication → URL Configuration: Site URL `https://<vercel-адреса>`, Redirect URLs `https://<vercel-адреса>/**`; Google provider: створити OAuth client у Google Cloud Console (Web application, Authorized redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`), вставити Client ID/Secret; Access token: Account → Access Tokens.
  3. **Gemini** — безкоштовний ключ (публічні дані) з AI Studio; платний ключ — окремий Google Cloud проєкт з білінгом, Budget alert $5; нагадування: безкоштовний ключ ніколи не вставляти у Vercel як приватний.
  4. **Trigger.dev Cloud** — створити проєкт, взяти project ref (`proj_…`) і Personal Access Token; Environment Variables (Production): `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY_PUBLIC`, `JOOBLE_API_KEY` (за наявності), `AI_DAILY_LIMIT` (необов'язково); взяти `TRIGGER_SECRET_KEY` (prod) для Vercel.
  5. **GitHub** — Settings → Secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `TRIGGER_ACCESS_TOKEN`; Variables: `TRIGGER_PROJECT_REF`.
  6. **Vercel** — Import Git Repository, Root Directory `apps/web`, Framework Next.js, Production Branch `main`; Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL` (= адреса Vercel), `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, `GEMINI_API_KEY_PRIVATE` (платний), `PRIVATE_AI_DAILY_LIMIT=100`, `TRIGGER_SECRET_KEY`. Після першого деплою — оновити Site URL у Supabase, якщо адреса інша.
  7. **Перший запуск** — злити `develop → main`; перевірити, що workflow `deploy` зелений, Vercel задеплоїв, у Trigger.dev з'явились задачі й розклади; зареєструватися через Google, онбординг з CV; через ~1 год перевірити «Сьогодні».
  8. **Пізніше: домен і Resend** — купити домен, додати у Vercel (Domains), оновити `SITE_URL` і Site URL у Supabase; Resend: додати домен, DNS-записи, API key; Supabase → Auth → SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = API key, sender `no-reply@<домен>`.
  9. **Таблиця змінних** — змінна | де (Vercel / Trigger.dev / GitHub) | звідки взяти | обов'язкова?
  10. **Що робити, якщо…** — workflow впав на «Missing GitHub secret»; вхід редіректить на localhost (Site URL); «AI unavailable» (немає `GEMINI_API_KEY_PRIVATE`); кредит Trigger.dev скінчився (задачі стоять до 1-го числа; зменшити частоту).

- [ ] **Step 3:** `README.md` — розділ «Deploy»: одне речення + посилання на `docs/deploy.md`. Роадмап — рядок `| **8. Деплой** | Vercel + Supabase Cloud + Trigger.dev Cloud, CI-деплой з main, ліміт платного AI на користувача, пряме завантаження CV | 10 | ✅ PR #10 |` після рядка 6c.

- [ ] **Step 4:** `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.

- [ ] **Step 5: Commit**
```bash
git add .github docs README.md
git commit -m "ci: deploy migrations and Trigger.dev tasks on main; owner deploy guide"
```
