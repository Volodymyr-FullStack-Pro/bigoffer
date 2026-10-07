# План 6b (мінімальний) — Telegram-бот: сповіщення, дайджест, кнопки: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Користувач підключає Telegram одним натисканням і отримує: миттєве сповіщення про нову вакансію зі скором ≥ свого порогу (з кнопками «Відкрити», «Сховати», «Відгукнувся»), щоденний дайджест о `digest_hour` за своїм часовим поясом. Мета — відгукуватися в перші години.

**Architecture:** Без нових залежностей — Bot API через `fetch`. `packages/core/src/telegram/` — чисті функції: форматування повідомлень (HTML з екрануванням, en/uk/ru), клавіатури, кодек `callback_data`, Zod-схема апдейту, тонкий клієнт Bot API з інжектованим `fetch`. Веб: прив'язка через одноразовий токен (`t.me/<bot>?start=<token>`), вебхук `POST /api/telegram/webhook` (перевірка `X-Telegram-Bot-Api-Secret-Token`), обробка `/start`, `/stop`, натискань кнопок через service-role клієнт лише в цьому роуті. Trigger.dev: задачі `telegram-alerts` (кожні 15 хв) і `telegram-digest` (щогодини, користувачі, у яких зараз `digest_hour` за їх `timezone`).

**Tech Stack:** TypeScript 6.0.3, Zod 4, Supabase (Postgres, pgTAP), Next.js 16 Route Handlers, Trigger.dev 4.6.4, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` — «Дайджест» (Telegram у `digest_hour` за TZ, deep link `t.me/<bot>?start=<token>`), «Telegram недоставлен (бот заблокирован) → обнулить `telegram_chat_id`», секрети лише в env сервера. Рішення власника в чаті 2026-10-07: миттєві сповіщення + ранковий дайджест + кнопки «Відкрити / Сховати / Відгукнувся».

## Global Constraints

- Всі Global Constraints попередніх планів (TS 6.0.3, `@jp/`, revoke → grant → RLS, лише нові міграції, Zod на межах, messages en/uk/ru з однаковими ключами, без нових залежностей, локальну БД не скидати, E2E на `E2E_PORT=3100`).
- **Без grammY та інших бібліотек**: Bot API `https://api.telegram.org/bot<token>/<method>` через `fetch` (рішення: специфікація згадувала grammY, але потрібні 3 методи — `sendMessage`, `answerCallbackQuery`, `editMessageReplyMarkup`).
- Токен бота, секрет вебхука і service-role ключ — лише в env сервера (Vercel / Trigger.dev); ніколи в клієнтському коді й логах.
- Вебхук приймає запит лише з правильним `X-Telegram-Bot-Api-Secret-Token` (порівняння з постійним часом); інакше `401` без тіла.
- Токен прив'язки: 32 випадкові байти base64url, у БД — лише SHA-256 хеш, живе **15 хв**, одноразовий.
- Сповіщення: не більше **5** окремих повідомлень на користувача за запуск; решта — одним рядком «ще N у BigOffer»; поріг за замовчуванням **75**; лише матчі зі станом `new`, `notified_at is null`, створені за останні 24 год, у вакансії `is_job` не `false`.
- Дайджест: топ-**10** нових матчів за 24 год за скором + кількість + блок «Пора нагадати про себе» (заявки з `next_action_at <= now()`), раз на добу в `digest_hour` за `profiles.timezone`.
- Telegram відповідає `403` (бот заблокований) → `profiles.telegram_chat_id = null`.
- Без токена бота (`TELEGRAM_BOT_TOKEN` порожній) клієнт Bot API нічого не надсилає і пише один рядок у лог — щоб локальна розробка й E2E працювали без Telegram.
- Тексти повідомлень — мовою `profiles.locale` (en/uk/ru).

## Структура файлів

```
supabase/migrations/20261013000100_telegram_bot.sql
supabase/tests/database/011_telegram_bot.test.sql
packages/core/src/telegram/{format.ts, format.test.ts, update.ts, update.test.ts, api.ts, api.test.ts, index.ts}
apps/web/src/lib/supabase/admin.ts                    server-only service-role client
apps/web/src/app/api/telegram/webhook/route.ts        + route.test.ts
apps/web/src/app/[locale]/(app)/profile/telegram-section.tsx, telegram-actions.ts
apps/web/messages/{en,uk,ru}.json, apps/web/e2e/telegram.spec.ts, apps/web/.env.example
apps/jobs/src/pipeline/telegram.ts                    alerts + digest logic
apps/jobs/src/trigger/{telegram-alerts.ts, telegram-digest.ts}
apps/jobs/test/telegram.int.test.ts, apps/jobs/src/env.ts, apps/jobs/.env.example
docs/deploy.md, docs/superpowers/plans/2026-10-01-roadmap.md
```

---

### Task 1: БД — токени прив'язки, налаштування сповіщень, позначка «надіслано», дія з бота

**Files:** Create `supabase/migrations/20261013000100_telegram_bot.sql`, `supabase/tests/database/011_telegram_bot.test.sql`; Modify `packages/db/src/database.types.ts` (regen)

**Interfaces (Produces):**
- `telegram_link_tokens(token_hash text primary key, user_id uuid references auth.users on delete cascade, expires_at timestamptz not null, created_at timestamptz default now())` — лише `service_role`.
- `profiles.telegram_alerts boolean not null default true`, `profiles.telegram_min_score smallint not null default 75 check (between 0 and 100)` — користувач може оновлювати (додати до column-level `grant update` на `profiles`, як `digest_hour`). `profiles.digest_last_sent_on date` — лише сервер.
- `job_matches.notified_at timestamptz` — лише сервер.
- `create_telegram_link_token(p_token_hash text) returns void` — **authenticated**, security definer, `search_path=''`: видаляє попередні токени `auth.uid()` і вставляє новий з `expires_at = now() + interval '15 minutes'`.
- `link_telegram(p_token_hash text, p_chat_id bigint) returns uuid` — лише `service_role`: знаходить невичерпаний токен, видаляє його, знімає цей `chat_id` з інших профілів (один чат — один акаунт), ставить `profiles.telegram_chat_id`, повертає `user_id` (або `null`).
- `bot_save_match(p_user_id uuid, p_match_id uuid, p_column_key text) returns uuid` — лише `service_role`, security definer: виконує `set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true)` і викликає `public.save_match_to_board(p_match_id, p_column_key, <rank зверху колонки>)`, повертає `application_id`; якщо матч не належить користувачу — помилка (її кидає `save_match_to_board` через RLS/перевірки). Rank: використати ту саму логіку «нагору колонки», що і веб (`rankAtTop`) — якщо в SQL її немає, передавати `p_rank` параметром: `bot_save_match(p_user_id, p_match_id, p_column_key, p_rank text)`; ранг обчислює викликач через `fractional-indexing` так само, як `rankAtTop` у вебі.

- [ ] **Step 1: pgTAP** `011_telegram_bot.test.sql` (план ≥ 10): authenticated створює токен → рядок з хешем, `expires_at` у майбутньому; повторне створення лишає один токен; `authenticated` не може читати `telegram_link_tokens` (42501) і не може оновити `telegram_chat_id` (42501) / може оновити `telegram_min_score`; `link_telegram` як `service_role`: валідний хеш → повертає user_id, ставить chat_id, токен видалено; повторне використання → `null`; прострочений → `null`; той самий chat_id для іншого користувача знімається з першого; `bot_save_match` створює заявку в колонці `applied` для власника матчу і не дає зберегти чужий матч; `anon` не виконує жодну з функцій.
- [ ] **Step 2: Міграція** — таблиця, колонки, функції, grants (revoke → grant → RLS), коментарі.
- [ ] **Step 3:** `supabase migration up --local && supabase test db && pnpm db:types && pnpm typecheck` → PASS. **Не `db reset`.**
- [ ] **Step 4: Commit** `feat(db): telegram linking tokens, alert settings, notified marks, bot board action`

---

### Task 2: core — форматування, кодек кнопок, схема апдейту, клієнт Bot API

**Files:** Create `packages/core/src/telegram/{format.ts, update.ts, api.ts, index.ts}` + тести; Modify `packages/core/src/index.ts` (`export * from './telegram'`)

**Interfaces (Produces):**
```ts
export type TgLocale = 'en' | 'uk' | 'ru';
export type AlertJob = { matchId: string; title: string; company: string | null; score: number; salary: string | null; location: string | null; remote: string | null; why: string | null };
export function escapeHtml(s: string): string;                       // & < > "
export function alertMessage(job: AlertJob, locale: TgLocale, siteUrl: string): { text: string; replyMarkup: InlineKeyboard };
export function overflowMessage(count: number, locale: TgLocale, siteUrl: string): string;
export function digestMessage(d: { total: number; top: AlertJob[]; followUps: { company: string; title: string }[] }, locale: TgLocale, siteUrl: string): { text: string; replyMarkup: InlineKeyboard };
export type CallbackAction = { kind: 'hide' | 'applied'; matchId: string };
export function encodeCallback(a: CallbackAction): string;             // 'h:<uuid>' | 'a:<uuid>' (≤ 64 bytes)
export function decodeCallback(data: string): CallbackAction | null;   // strict UUID check
export const telegramUpdateSchema: z.ZodType<TelegramUpdate>;         // message.text/chat.id/from.language_code; callback_query.id/data/message.chat.id/message.message_id
export function parseStart(text: string): { token: string } | null;   // '/start <base64url 43 chars>'
export type BotApi = { sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboard): Promise<BotResult>; answerCallback(id: string, text?: string): Promise<BotResult>; clearButtons(chatId: number, messageId: number): Promise<BotResult> };
export type BotResult = { ok: true } | { ok: false; blocked: boolean; status: number };
export function createBotApi(token: string | undefined, fetchImpl?: typeof fetch): BotApi;  // token undefined → no-op ok:true + one console.info
```
- «Відкрити» — URL-кнопка `${siteUrl}/<locale>/today?match=<matchId>` (якщо `today` ще не читає `match` — Task 3 додає підсвічування/відкриття деталей за параметром; мінімум — сторінка відкривається). «Сховати» → `h:`, «Відгукнувся» → `a:`.
- Повідомлення: перший рядок `🔥 <b>{score}%</b> · {title}`, далі компанія, зарплата/локація/remote (що є), `why` (до 300 символів), усе через `escapeHtml`; `parse_mode: 'HTML'`, `disable_web_page_preview: true`. Тексти кнопок і рядків — словник у `format.ts` для en/uk/ru (uk: «Відкрити», «Сховати», «Відгукнувся», «ще {n} нових вакансій у BigOffer», «Дайджест: {n} нових вакансій за добу», «Пора нагадати про себе»; en/ru — відповідні).
- `api.ts`: `POST https://api.telegram.org/bot${token}/${method}` JSON; `403` → `{ ok:false, blocked:true }`; помилки мережі → `{ ok:false, blocked:false, status:0 }`; **ніколи** не включати токен у повідомлення помилок/логів.

- [ ] **Step 1: Тести** — `escapeHtml` (`<script>&"` → `&lt;script&gt;&amp;&quot;`); `alertMessage` для uk містить «Відкрити», URL `…/uk/today?match=<id>`, `callback_data` `h:<id>`/`a:<id>`, екранує назву з `<b>`; `decodeCallback('h:not-a-uuid') === null`, `decodeCallback('x:<uuid>') === null`, кругова перевірка encode/decode; довжина callback ≤ 64; `parseStart('/start abc')` → `null` (не 43 символи), валідний → `{token}`; `telegramUpdateSchema` приймає зразки message/callback і відкидає без `update_id`; `createBotApi(undefined)` → `sendMessage` ok без виклику fetch; з fake fetch → правильний URL/тіло; `403` → `blocked: true`; помилка не містить токен.
- [ ] **Step 2: Реалізація** (див. інтерфейси).
- [ ] **Step 3:** `pnpm --filter @jp/core test && pnpm typecheck` → PASS.
- [ ] **Step 4: Commit** `feat(core): telegram message formatting, callback codec, update schema and Bot API client`

---

### Task 3: Веб — підключення в профілі, вебхук, кнопки

**Files:** Create `apps/web/src/lib/supabase/admin.ts`, `apps/web/src/app/api/telegram/webhook/route.ts` (+ unit-тест на чисту логіку, якщо винести її в `apps/web/src/lib/telegram-webhook.ts`), `apps/web/src/app/[locale]/(app)/profile/telegram-section.tsx`, `telegram-actions.ts`, `apps/web/e2e/telegram.spec.ts`; Modify профіль-сторінку (додати секцію), `today/page.tsx` + `feed.tsx` (параметр `?match=<id>` відкриває/підсвічує цей матч, якщо він у списку), messages en/uk/ru, `.env.example`, `apps/web/e2e/helpers/seed.ts`

**Interfaces:**
- Consumes: Task 1 функції; Task 2 `telegramUpdateSchema`, `parseStart`, `decodeCallback`, `createBotApi`, `alertMessage` тощо.
- Env (сервер): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY`; публічний `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Секцію в профілі не показувати (або показати «бот не налаштовано»), якщо немає `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.

- [ ] **Step 1: `admin.ts`** — `import 'server-only'`; `createAdminSupabase()` з `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY` (`auth: { persistSession: false }`); кидає зрозумілу помилку без значень, якщо ключа немає. Використовується **лише** у вебхуку.
- [ ] **Step 2: Підключення** — `telegram-actions.ts` (`'use server'`): `createTelegramLink(): Promise<{ ok: true; url: string } | { ok: false }>` — генерує токен (`crypto.getRandomValues` 32 байти → base64url), хеш SHA-256 hex → `rpc('create_telegram_link_token', { p_token_hash })` клієнтом користувача; URL `https://t.me/${bot}?start=${token}`. `disconnectTelegram()` — **не можна** оновити `telegram_chat_id` користувачем; додати в Task 1 функцію? → використати RPC `unlink_telegram()` (authenticated, definer, ставить `telegram_chat_id = null` для `auth.uid()`) — **додати її в міграцію Task 1** (якщо Task 1 вже закомічено — нова маленька міграція тут). `saveTelegramSettings(alerts: boolean, minScore: number, digestHour: number)` — звичайний update з валідацією (0–100, 0–23).
- [ ] **Step 3: Секція профілю** (`data-testid="telegram-section"`): стан «не підключено» → кнопка `telegram-connect` → показує посилання `telegram-link` (відкривається в новій вкладці) і підказку «Натисніть Start у боті; посилання діє 15 хв»; стан «підключено» (`telegram_chat_id` не null) → `telegram-connected`, перемикач `telegram-alerts`, поле `telegram-min-score` (0–100), селект `digest-hour` (0–23, з підписом часового поясу профілю), кнопка `telegram-disconnect`. Тексти en/uk/ru.
- [ ] **Step 4: Вебхук** `POST /api/telegram/webhook`:
  1. секрет із заголовка порівнюється з `TELEGRAM_WEBHOOK_SECRET` (`timingSafeEqual` на буферах однакової довжини); не збігається або env порожній → `401`;
  2. тіло → `telegramUpdateSchema.safeParse`; невалідне → `200` (щоб Telegram не ретраїв сміття);
  3. `/start <token>` → `link_telegram(sha256(token), chat_id)`; успіх → привітання мовою профілю («Готово! Сюди прийдуть нові вакансії ≥ {minScore}% і дайджест о {digestHour}:00»); провал → «Посилання застаріло — згенеруйте нове в профілі»; `/start` без токена → коротка інструкція;
  4. `/stop` → `telegram_chat_id = null` для профілю з цим chat_id, відповідь «Сповіщення вимкнено»;
  5. `callback_query` → `decodeCallback`; знайти профіль за `message.chat.id`; перевірити, що `job_matches.id = matchId` належить цьому користувачу; `hide` → `update job_matches set state='hidden'`; `applied` → `bot_save_match(user, match, 'applied', rank)`; `answerCallback` («Сховано» / «Додано на дошку»), `clearButtons`; чужий/неіснуючий матч → `answerCallback('Недоступно')`;
  6. завжди `200 {}` після обробки; винятки логувати без даних апдейту.
- [ ] **Step 5: `?match=`** — `today/page.tsx` приймає `searchParams.match` (UUID), `Feed` відкриває деталі цього матчу (desktop — вибраний у списку; mobile — першою карткою), якщо він є в даних.
- [ ] **Step 6: Тести**
  - unit (`telegram-webhook` логіка з фейковими `admin`/`bot`): 401 без/з хибним секретом; невалідне тіло → 200 без дій; `/start` валідний → виклик `link_telegram` з SHA-256 токена; callback чужого матчу → «Недоступно», без змін.
  - E2E `telegram.spec.ts` (dev-сервер з env `TELEGRAM_WEBHOOK_SECRET=e2e-secret`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=bigoffer_test_bot`, без `TELEGRAM_BOT_TOKEN` → відправка no-op; додати ці env у `playwright.config.ts` webServer): (1) профіль → `telegram-connect` → `telegram-link` має href `https://t.me/bigoffer_test_bot?start=` + 43 символи; (2) `request.post('/api/telegram/webhook')` із секретом і апдейтом `/start <token з href>` → після перезавантаження профілю видно `telegram-connected`; (3) апдейт `callback_query` `h:<matchId>` для засіяного матчу → матч зникає зі «Сьогодні»; (4) хибний секрет → 401. Desktop (mobile — лише (1)).
- [ ] **Step 7:** `pnpm --filter @jp/web test && pnpm --filter @jp/web lint && pnpm typecheck && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
- [ ] **Step 8: Commit** `feat(web): connect Telegram from the profile; webhook with link, stop and card buttons`

---

### Task 4: jobs — миттєві сповіщення і дайджест

**Files:** Create `apps/jobs/src/pipeline/telegram.ts`, `apps/jobs/src/trigger/telegram-alerts.ts`, `apps/jobs/src/trigger/telegram-digest.ts`, `apps/jobs/test/telegram.int.test.ts`; Modify `apps/jobs/src/env.ts` (`TELEGRAM_BOT_TOKEN`, `SITE_URL`), `apps/jobs/src/runtime.ts`, `apps/jobs/.env.example`

**Interfaces:**
- `sendAlerts(db, deps: { bot: BotApi; siteUrl: string; now: Date }): Promise<{ users: number; sent: number; blocked: number }>`
- `sendDigests(db, deps: { bot: BotApi; siteUrl: string; now: Date }): Promise<{ users: number; sent: number; blocked: number }>`

- [ ] **Step 1: Інтеграційні тести** (локальна Supabase, фейковий `BotApi`, що записує виклики): 
  - сповіщення: користувач з chat_id, поріг 75, матчі 90/80/60 (нові, за 24 год) → 2 повідомлення, `notified_at` проставлено обом, 60 — ні; повторний запуск → 0; 7 матчів ≥ 75 → 5 повідомлень + 1 «ще 2», усі 7 позначені; `telegram_alerts=false` → 0; вакансія `is_job=false` → пропуск; `blocked` від бота → `telegram_chat_id` стає `null`.
  - дайджест: `timezone='Europe/Kyiv'`, `digest_hour=8`, `now` = 08:10 за Києвом → 1 дайджест (топ ≤ 10, `total`, follow-ups з `next_action_at <= now`), `digest_last_sent_on` = сьогоднішня дата за Києвом; повторний запуск тієї ж години → 0; `now` = 09:10 → 0; немає нових матчів і follow-ups → не надсилати.
  - прибирання: створені тестом користувачі/дані видаляються в `afterAll`.
- [ ] **Step 2: `pipeline/telegram.ts`** — вибірки через service-role клієнт: профілі з `telegram_chat_id is not null`; для сповіщень — матчі `state='new'`, `notified_at is null`, `score >= telegram_min_score`, `created_at >= now-24h`, `jobs.is_job is distinct from false`, сортування за скором, ліміт 50 на користувача; `why` — `explanation[locale]` якщо є; позначати `notified_at` **після** успішної відправки (і для «overflow» — усі, що увійшли в підсумок); локальна година — `Intl.DateTimeFormat(…, { timeZone, hour: 'numeric', hourCycle: 'h23' })`, дата — `en-CA` формат у тій самій TZ.
- [ ] **Step 3: Задачі** — `telegram-alerts`: `schedules.task` cron `*/15 * * * *`, машина за замовчуванням (`micro`); `telegram-digest`: cron `5 * * * *`. Обидві: якщо `TELEGRAM_BOT_TOKEN` порожній — одразу повернути `{ skipped: 'no token' }` (не витрачати час). `SITE_URL` обов'язковий, коли токен є.
- [ ] **Step 4:** `pnpm --filter @jp/jobs typecheck && pnpm --filter @jp/jobs test:integration` → PASS.
- [ ] **Step 5: Commit** `feat(jobs): instant Telegram alerts for hot matches and a daily digest`

---

### Task 5: Документація і повний прогін

- [ ] **Step 1:** `docs/deploy.md` (українською) — новий розділ «Telegram-бот»: BotFather → `/newbot` → ім'я та username (`…_bot`) → токен; Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (згенерувати: `openssl rand -hex 32`), `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, `SUPABASE_SECRET_KEY` (тепер потрібен вебу — лише для вебхука); Trigger.dev: `TELEGRAM_BOT_TOKEN`, `SITE_URL`; реєстрація вебхука одноразово:
  ```
  curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -d "url=https://<домен>/api/telegram/webhook" \
    -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
    -d 'allowed_updates=["message","callback_query"]'
  ```
  перевірка `getWebhookInfo`; у профілі BigOffer → «Підключити Telegram» → Start. Оновити таблицю змінних і кількість розкладів Trigger.dev (тепер 6 з 10).
- [ ] **Step 2:** Роадмап: рядок Плану 6 — «6b (мінімальний: бот, сповіщення, дайджест) ✅ PR #13; картки зі скріншотів — пізніше».
- [ ] **Step 3:** `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm --filter @jp/jobs test:integration && E2E_PORT=3100 pnpm --filter @jp/web test:e2e` → PASS.
- [ ] **Step 4: Commit** `docs: telegram bot setup and plan 6b status`
