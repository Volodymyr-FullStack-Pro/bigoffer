# Job Platform — Подпроект 1: Фундамент + Поиск работы (MVP)

**Дата:** 2026-10-01
**Статус:** дизайн утверждён, ожидает ревью спеки
**Рабочее название:** Job Parser (финальный бренд — позже)

## 1. Цель

Платформа, в которую пользователь заходит каждый день и видит свежие, отобранные под его профиль вакансии со всех ключевых площадок, быстро их просматривает, откликается и ведёт отклики на канбан-доске.

- **Сейчас:** первый пользователь — автор (Full-Stack, React/Next.js/TS/Node/NestJS, 3+ года, English B2, Украина, remote).
- **Потом:** коммерческий SaaS для **любых профессий** (не только IT) на рынках Украины/СНГ + международный remote.

Каждое архитектурное решение должно работать для одного пользователя сегодня и для тысяч — без переписывания.

### Критерии успеха MVP

1. Каждое утро в Telegram приходит дайджест, по ссылке открывается лента «Сегодня» с вакансиями, отсортированными по совпадению.
2. В ленте вакансии из всех источников MVP, без дублей, с AI-резюме на языке пользователя.
3. Вакансию можно за один жест сохранить на доску, на доске — перетаскивать между колонками.
4. Интерфейс полностью на uk / ru / en, светлая и тёмная тема.
5. Данные одного пользователя недоступны другому (проверено тестами RLS).

## 2. Декомпозиция продукта

| № | Подпроект | Статус |
|---|---|---|
| **1** | **Фундамент + Поиск работы** | **этот документ** |
| 2 | Interview Prep: банк вопросов по ролям (Top-100/300), флеш-карточки с FSRS, связь с канбаном | следующий |
| 3 | Live coding: Monaco + Web Worker sandbox, Sandpack для React, задачи с тестами, AI-ревью | |
| 4 | AI мок-интервью (текст → голос) | |
| 5 | Рост и коммерция: Chrome extension (LinkedIn, Wellfound), Gmail OAuth, биллинг, тарифы, лендинг | |

Подпроект 1 закладывает для последующих: навигацию с разделом «Подготовка» (заглушка), i18n для контента (`jsonb {uk,ru,en}`), общие справочники `roles` и `skills`, событие «карточка перешла в Интервью» (`application_events`).

## 3. Вне рамок MVP (явно)

- Автоотклики (риск бана, падение качества) — только полуавтомат «письмо готово → клик сам».
- Парсинг LinkedIn с сервера под аккаунтом пользователя (нарушение ToS, бан аккаунта пользователя).
- Gmail OAuth (restricted scope → CASA-аудит), Wellfound, Chrome extension — подпроект 5.
- Организации/команды, биллинг. Поле `profiles.plan` есть, `org_id` добавится миграцией.
- Web Push — после MVP (в MVP канал уведомлений — Telegram).
- Перевод полного текста вакансий (переводится только AI-резюме; кнопка «перевести» — после MVP).

## 4. Архитектура

### 4.1 Стек

| Слой | Выбор |
|---|---|
| Монорепо | Turborepo + pnpm, TypeScript strict |
| Web | Next.js 15 (App Router, Server Components, Server Actions), Vercel |
| UI | Tailwind CSS v4, shadcn/ui, Motion (анимации), Lucide, dnd-kit, TanStack Query |
| i18n | next-intl, префикс локали в URL (`/uk`, `/ru`, `/en`) |
| Темы | next-themes (light / dark / system) |
| БД / Auth / Storage | Supabase: Postgres + RLS, Auth (email magic link + Google), Storage, Realtime |
| Фоновые задачи | Trigger.dev v4 (cron, очереди, ретраи, concurrency per source, Playwright) |
| AI | Claude Haiku 4.5 (обогащение, пояснения, письмо, парсинг CV), prompt caching |
| Входящая почта | Cloudflare Email Routing → Email Worker → подписанный webhook |
| Уведомления | Telegram Bot (grammY) |
| Валидация | Zod — на всех границах (адаптеры, API, LLM-выход) |
| Тесты | Vitest, Playwright, SQL-тесты RLS |
| CI | GitHub Actions: lint, typecheck, test на каждый PR |

Отклонённые альтернативы: GitHub Actions cron вместо Trigger.dev (нет очередей/ретраев/планировщика по запросам — не масштабируется в SaaS); свой NestJS-бэкенд (в 2–3 раза дольше без продуктовой выгоды на этом этапе; бизнес-логика вынесена в `packages/*`, переезд возможен).

### 4.2 Схема потоков

```
                    ┌────────────────── Trigger.dev ──────────────────┐
 cron (ежечасно)    │ schedule-queries: выбрать search_queries с       │
 ─────────────────▶ │   next_run_at <= now → задача на каждый запрос   │
                    │ scrape-source: fetch → normalize → dedupe →      │
                    │   upsert jobs/job_postings                       │
                    │ enrich-job: LLM-извлечение структуры (1 раз)     │
                    │ match-jobs: формула score → job_matches          │
                    │ explain-top: LLM-пояснение топ-20/день           │
                    │ send-digest: Telegram в 9:00 по TZ пользователя  │
                    │ expire-jobs: ежедневно                           │
                    └────────────────────┬─────────────────────────────┘
 Входящая почта ──webhook──▶ apps/web /api/inbound-email → parse-email task
                                        │
                    ┌──────────── Supabase ────────────┐
                    │ Postgres + RLS, Auth, Storage,   │
                    │ Realtime                         │
                    └────────────────┬─────────────────┘
                                     ▼
              Next.js: лента · доска · профиль · настройки · (подготовка — скоро)
```

### 4.3 Структура репозитория

```
job-parser/
├── apps/
│   ├── web/              # Next.js: UI + тонкие API-роуты (inbound email, telegram webhook)
│   ├── jobs/             # Trigger.dev задачи (оркестрация, без бизнес-логики)
│   └── email-worker/     # Cloudflare Email Worker → webhook
├── packages/
│   ├── core/             # чистые функции: normalize, fingerprint, score, email-parsers
│   ├── scrapers/         # по адаптеру на источник, общий интерфейс SourceAdapter
│   ├── ai/               # промпты, Zod-схемы ответов, клиент Claude
│   ├── db/               # supabase-клиенты, сгенерированные типы, запросы
│   └── ui/               # дизайн-токены, общие компоненты (при необходимости)
├── supabase/
│   ├── migrations/
│   ├── seed.sql          # роли, навыки, источники, колонки по умолчанию
│   └── tests/            # RLS-тесты
└── docs/
```

Правило: `apps/*` только оркестрируют, вся логика — в `packages/*` и покрыта тестами.

## 5. Модель данных

### 5.1 Принцип мультитенантности

- **Глобальные таблицы** (`roles`, `skills`, `sources`, `companies`, `jobs`, `job_postings`, `search_queries`, `source_runs`): `SELECT` — любому `authenticated`; запись — только `service_role` (воркеры). `source_runs` — только service_role/админ.
- **Пользовательские таблицы**: RLS `user_id = auth.uid()` на все операции.
- Одна вакансия хранится один раз, сколько бы пользователей её ни видели.

### 5.2 Справочники

```sql
roles   (id, slug UNIQUE, name jsonb {uk,ru,en}, category text)
skills  (id, slug UNIQUE, name jsonb, aliases text[])
sources (id text PK, name, kind: 'html'|'api'|'rss'|'email',
         enabled bool, min_interval_minutes int, paused_until timestamptz)
```

### 5.3 Вакансии (глобальные)

```sql
companies    (id, name, normalized_name UNIQUE, website, logo_url)
jobs         (id, fingerprint UNIQUE, title, company_id, description_text,
              location, remote_type: 'remote'|'hybrid'|'office'|'unknown',
              salary_raw, posted_at, first_seen_at, last_seen_at,
              status: 'active'|'expired',
              -- обогащение (LLM, один раз на вакансию):
              role_id, seniority: 'intern'|'junior'|'middle'|'senior'|'lead'|null,
              skills text[], salary_min_usd int, salary_max_usd int,
              lang text, summary jsonb {uk,ru,en}, enriched_at, enrich_error text)
job_postings (id, job_id, source_id, external_id, url, seen_at,
              UNIQUE(source_id, external_id))
```

Индексы: `pg_trgm` GIN на `jobs.title`; `(status, first_seen_at desc)`; GIN на `jobs.skills`.

### 5.4 Сбор по запросам

```sql
search_queries (id, source_id, query_key UNIQUE, params jsonb,
                last_run_at, next_run_at)
source_runs    (id, source_id, query_id, status: 'ok'|'error'|'blocked',
                found int, inserted int, error text, started_at, finished_at)
```

`query_key` — детерминированный хэш нормализованных `params` + `source_id`. Сто пользователей с одинаковым запросом = одна строка, один запуск.

### 5.5 Пользователь

```sql
profiles        (id = auth.users.id PK, full_name, locale: 'uk'|'ru'|'en',
                 timezone, telegram_chat_id, inbound_email_token UNIQUE,
                 digest_hour int default 9, plan text default 'free',
                 onboarded_at)
search_profiles (id, user_id, name, role_id, keywords text[],
                 exclude_keywords text[], seniority text[], locations text[],
                 remote_type, salary_min_usd int, is_active bool)
search_profile_queries (search_profile_id, search_query_id, PK both)
resumes         (id, user_id, storage_path, parsed jsonb, is_primary bool)
letter_templates(id, user_id, name, body text, locale)
job_matches     (id, user_id, job_id, search_profile_id, score smallint,
                 breakdown jsonb, explanation jsonb {uk,ru,en},
                 state: 'new'|'seen'|'hidden'|'saved', created_at,
                 UNIQUE(user_id, job_id))
```

### 5.6 Канбан

```sql
board_columns      (id, user_id, key, title jsonb, position int,
                    kind: 'active'|'won'|'lost')
applications       (id, user_id, job_id NULL, column_id, rank text,
                    title, company, url,          -- снапшот; job_id NULL = ручная карточка
                    applied_at, next_action_at, salary text, notes text,
                    contact jsonb, created_at, updated_at)
application_events (id, application_id, user_id,
                    type: 'created'|'moved'|'note'|'email'|'reminder',
                    payload jsonb, created_at)
inbound_emails     (id, user_id, from_addr, subject, storage_path,
                    parsed_as: 'linkedin_alert'|'djinni_alert'|'forward_verification'|'unknown',
                    jobs_extracted int, received_at)
```

- Колонки по умолчанию создаются триггером при создании профиля: **Сохранено → Откликнулся → Тестовое → Интервью → Оффер (won) → Отказ (lost)**.
- `rank` — fractional indexing (библиотека `fractional-indexing`): перетаскивание обновляет одну строку.
- `application_events` — источник истории карточки и будущий триггер для подпроекта 2 («перешла в Интервью → план подготовки»).

## 6. Конвейер сбора и скоринга

### 6.1 Источники MVP

| Источник | Способ | Примечание |
|---|---|---|
| DOU | RSS (`jobs.dou.ua/vacancies/feeds/`) | категории + ключевые слова |
| Djinni | HTML (`/jobs/?primary_keyword=…`) | + письма-алерты через inbound |
| Work.ua | HTML | серверный рендер, cheerio |
| robota.ua | внутренний JSON API | |
| Jooble | официальный API (ключ) | агрегатор, все профессии |
| RemoteOK | JSON API | |
| Remotive | JSON API | |
| Himalayas | JSON API | |
| WeWorkRemotely | RSS | |
| HN Who's Hiring | Algolia API | ежемесячный тред |
| LinkedIn | письма Job Alerts → inbound email | без серверного парсинга |

Wellfound — подпроект 5 (Chrome extension), защищён Cloudflare/DataDome.

### 6.2 Контракт адаптера

```ts
interface SourceAdapter {
  id: SourceId;
  kind: 'html' | 'api' | 'rss';
  /** Нормализует параметры поиска пользователя в параметры источника. */
  toQueryParams(input: SearchInput): Record<string, unknown> | null; // null = источник не подходит
  search(params: Record<string, unknown>, ctx: AdapterContext): AsyncIterable<RawJob>;
}
```

`AdapterContext` предоставляет `fetch` с rate-limit, ретраями, User-Agent и логированием. Адаптер не пишет в БД.

### 6.3 Этапы

1. **Normalize** — `RawJob` → Zod → `NormalizedJob`. Невалидная запись пропускается с логом, выдача не падает.
2. **Dedupe** — `fingerprint = sha256(normalize(company) | normalize(title) | regionBucket)`. При промахе — fallback: та же компания + `similarity(title) > 0.9` (pg_trgm) за 14 дней. Совпадение → новый `job_posting` к существующему `job`, обновить `last_seen_at`.
3. **Enrich** (только новые jobs) — Claude Haiku 4.5, structured output по Zod-схеме: роль, грейд, навыки (маппинг на `skills.aliases`), зарплата → USD, remote_type, язык, `summary {uk,ru,en}` (2 предложения). Системный промпт кэшируется. Ошибка → `enrich_error`, вакансия всё равно матчится по ключевым словам.
4. **Match** — для каждого активного `search_profile`, к которому привязан запрос:

   | Компонент | Вес | Логика |
   |---|---|---|
   | Навыки | 35 | доля навыков профиля, найденных в `jobs.skills` / тексте |
   | Роль | 25 | совпадение `role_id` или ключевых слов в заголовке |
   | Грейд | 15 | точное = 15, соседний = 8, иначе 0, неизвестен = 8 |
   | Локация/remote | 15 | совместимость `remote_type` и `locations` |
   | Зарплата | 10 | `salary_max_usd >= salary_min_usd` = 10, неизвестна = 5 |

   `exclude_keywords` в заголовке/тексте → `state = 'hidden'`. `breakdown` сохраняется для UI.
5. **Explain** — один раз в день на пользователя для топ-20 новых `job_matches`: LLM пишет 1 строку «почему подходит» на `profiles.locale`.

### 6.4 Планирование и защита от банов

- `schedule-queries` ежечасно; каждый запрос запускается не чаще `sources.min_interval_minutes` (DOU/API — 60, HTML — 120–180).
- Trigger.dev queue на источник с `concurrencyLimit: 1`, случайная пауза 1–4 c между запросами страниц.
- Ретраи: экспоненциальный backoff, 3 попытки.
- 403/429/капча → `sources.paused_until = now() + 1h` (circuit breaker), `source_runs.status = 'blocked'`.
- 3 запуска подряд с `found = 0` у исправного источника → алерт админу в Telegram (смена вёрстки).
- `expire-jobs` ежедневно: `last_seen_at < now() - 14 days` → `expired`.

### 6.5 Входящая почта

1. При онбординге пользователь получает адрес `<inbound_email_token>@in.<domain>` и инструкцию по автопересылке (Gmail / Outlook / ukr.net).
2. Cloudflare Email Worker → `POST /api/inbound-email` с HMAC-подписью.
3. Сырое письмо → Storage, строка в `inbound_emails`, задача `parse-email`.
4. Парсер по отправителю: LinkedIn Job Alerts, Djinni → список вакансий (title, company, url) → тот же конвейер (normalize → dedupe → enrich → match) с источником `linkedin` / `djinni`. Неизвестный формат → LLM-извлечение.
5. Письма подтверждения пересылки (Gmail verification) распознаются и показываются пользователю в настройках с кодом.

## 7. UX

### 7.1 Ежедневный сценарий

1. **Дайджест** в Telegram в `digest_hour` по TZ: «🔥 14 новых вакансий, 3 — 90%+» + топ-3 + кнопка «Смотреть» (deep link `/[locale]/feed/today`). Подключение бота — кнопка в настройках (deep link `t.me/<bot>?start=<token>`).
2. **Лента «Сегодня»** — `job_matches.state = 'new'` за последние 24 ч (или с последнего визита), сортировка по score.
   - **Мобайл — колода карточек**: свайп вправо → сохранить (карточка в «Сохранено»), влево → скрыть, вверх/тап → детали. Дублирующие кнопки внизу. Тост «Отменить» 5 с.
   - **Десктоп — почтовый клиент**: список слева, детали справа. Хоткеи: `J/K` навигация, `S` сохранить, `H` скрыть, `A` откликнулся, `O` открыть оригинал.
   - Прогресс «8 / 14». Пустое состояние «Всё просмотрено 🎉» + статистика дня.
   - Фильтры: профиль поиска, мин. score, remote, источник. Вкладка «Все» — архив с поиском.
3. **Карточка**: шкала совпадения, заголовок, компания + лого, зарплата, remote/город, грейд, до 5 навыков (совпавшие подсвечены), AI-резюме (2 строки), «почему подходит», иконки источников, «2 ч назад».
4. **Детали**: AI-резюме, разбор совпадения (навыки ✓/✗, breakdown), полный текст, все ссылки. Действия:
   - **Откликнуться** — открывает оригинал; при возврате на вкладку (`visibilitychange`) — диалог «Откликнулись?» → «да» создаёт/перемещает карточку в «Откликнулся» с `applied_at`.
   - **Сгенерировать письмо** — берёт шаблон пользователя, LLM заменяет `[…]`-плейсхолдер одной персональной строкой под вакансию, результат можно отредактировать и скопировать.
   - Сохранить / Скрыть.
5. **Доска**: колонки из `board_columns`, dnd-kit (мышь, тач с long-press, клавиатура). На карточке: компания, роль, «откликнулся 6 дн. назад», значок напоминания при `next_action_at <= now`. Клик → боковая панель: заметки, контакт, история событий, ссылка на вакансию. Кнопка «+ Добавить вручную».
6. **Напоминания**: ежедневная задача — карточки в «Откликнулся» > 7 дней без событий → строка в дайджесте «Пора написать follow-up: …».

### 7.2 Онбординг

1. Регистрация (magic link или Google).
2. Выбор языка (предзаполнен из `Accept-Language`).
3. Загрузка CV (PDF) → LLM-парсинг → предзаполненный профиль поиска (роль, навыки, грейд, локации, языки).
4. Правка профиля поиска + стоп-слова.
5. Шаблон сопроводительного письма (предзаполнен заготовкой; плейсхолдер `[…]`).
6. Подключение Telegram и адреса для пересылки (можно пропустить).
7. Первый сбор запускается немедленно; экран «Собираем вакансии…» с live-счётчиком через Realtime.

### 7.3 Оболочка и навигация

- Десктоп — боковая панель; мобайл — нижний таб-бар: **Сегодня / Доска / Подготовка (скоро) / Профиль**.
- В шапке: переключатель языка (UK/RU/EN) и темы (светлая/тёмная/системная). Выбор языка сохраняется в `profiles.locale` и cookie.
- PWA (manifest + иконки) — устанавливается на телефон.

### 7.4 Визуальный стиль — «Neo-brutal Job Zine»

Вдохновлён syntax.fm (тёмная база, один кислотный акцент, моно-шрифт, шум-текстура, толстые рамки), но своя айдентика и дружелюбность к не-IT.

- **Шрифты** (все с кириллицей): **Unbounded** — заголовки; **Onest** — основной текст; **JetBrains Mono** — только мета (зарплата, время, score, теги).
- **Цвет**: тёмная тема — графит `oklch(16% 0 0)`; светлая — тёплая бумага `#F4F1E8`. Акцент — кислотный лайм `#C6F432`; вторичный (AI-функции) — электрический фиолетовый `#7B5CFF`; статусы: success (оффер), coral (отказ), amber (напоминание). Шкала серых — OKLCH.
- **Фактура**: шум-текстура (SVG) на фоне; рамки 2px; жёсткие смещённые тени `4px 4px 0`; кнопка «вдавливается» при нажатии (тень → 0, translate).
- **Фирменные элементы**: карточки-стикеры с наклоном при свайпе и штампом **SAVED / APPLIED**; шкала совпадения в стиле VU-метра (сегменты); колонки доски как стопки стикеров; конфетти при переносе в «Оффер»; плитка активности в стиле GitHub (просмотры/отклики за день).
- **Токены**: CSS-переменные через Tailwind v4 `@theme` поверх shadcn/ui; структура допускает дополнительные цветовые скины.
- **Доступность**: WCAG AA в обеих темах; `prefers-reduced-motion` отключает анимации; у каждого свайпа есть кнопка; доска управляется с клавиатуры.

## 8. i18n

- UI: next-intl, сообщения в `apps/web/messages/{uk,ru,en}.json`; ключи типизированы; CI проверяет, что все локали содержат одинаковые ключи.
- Контент: поля `jsonb {uk,ru,en}` (роли, навыки, колонки, AI-резюме). Хелпер `t(field, locale)` с фолбэком `locale → en → первый доступный`.
- Тексты вакансий не переводятся; AI-резюме и пояснения — на языке пользователя.
- Даты/числа/валюты — `Intl` по локали.

## 9. Обработка ошибок

| Ситуация | Поведение |
|---|---|
| Невалидная запись из источника | пропуск + лог, остальная выдача обрабатывается |
| Источник блокирует (403/429/капча) | circuit breaker на 1 ч, `source_runs.status='blocked'` |
| Источник молча вернул 0 трижды | алерт админу в Telegram |
| LLM недоступен / невалидный JSON | ретрай 2×; затем `enrich_error`, матчинг по ключевым словам |
| Ошибка генерации письма | показать шаблон без персонализации + тост |
| Неподписанный/неверный inbound webhook | 401, без записи |
| Неизвестный формат письма | LLM-извлечение; при неудаче — `parsed_as='unknown'`, видно в настройках |
| Telegram недоставлен (бот заблокирован) | обнулить `telegram_chat_id`, баннер в приложении |
| Оптимистичное обновление доски не удалось | откат позиции + тост |

Секреты (Supabase service key, Anthropic, Telegram, HMAC) — только в env сервера/Trigger.dev; клиент использует только anon key + RLS.

## 10. Тестирование

- **packages/core** — Vitest, TDD: normalize, fingerprint, regionBucket, score, email-парсеры, i18n-фолбэк.
- **packages/scrapers** — тесты на сохранённых фикстурах HTML/JSON/RSS каждого источника; ежедневный канареечный прогон на живых сайтах (Trigger.dev) с алертом.
- **packages/ai** — тесты Zod-схем и маппинга ответов на фикстурах (без живых вызовов в CI).
- **БД** — SQL-тесты RLS: пользователь A не читает/не меняет данные B; `authenticated` не пишет в глобальные таблицы.
- **E2E (Playwright)** — вход → онбординг → лента → свайп/сохранение → карточка на доске → перетаскивание; прогон для трёх локалей и обеих тем (скриншоты).
- **CI** — GitHub Actions: lint, typecheck, unit, RLS (локальный Supabase), E2E на preview.

## 11. Операционные заметки

- Домен продукта не выбран: до выбора inbound-адреса работают на временном домене, `<domain>` в тексте — конфиг `INBOUND_EMAIL_DOMAIN`.
- Окружения: local (`supabase start`, Trigger.dev dev), production (Supabase cloud, Vercel, Trigger.dev cloud, Cloudflare).
- Оценка стоимости MVP: Supabase Free, Vercel Hobby, Trigger.dev Free, Cloudflare Email Routing бесплатно, Haiku ~1–3 $/мес при ~300 новых вакансий/день.
- Личные файлы (`docs/*.pdf`, письма) не коммитятся — `.gitignore`.
- Соблюдение условий площадок: низкая частота, без обхода авторизации, без серверного логина в LinkedIn.
