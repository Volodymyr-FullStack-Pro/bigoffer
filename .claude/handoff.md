# Handoff — 2026-10-03 09:23

Ветка git: `feat/plan-3-sources` (чистое дерево, всё запушено)

## Цель сессии

Строим **BigOffer** — платформу поиска работы (сначала для себя, потом коммерческий SaaS для любых профессий): ежедневная лента вакансий с топ-площадок, канбан откликов, AI-помощь. Работаем по спеке и планам через superpowers (brainstorming → writing-plans → subagent-driven-development).

## Что сделано

- **Спека:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` (раздел 12 — расширения от 2026-10-03: площадки + выбор галочками, Gemini AI с публичным/приватным ключом, умная доска, анализ карточки, несколько почтовых ящиков).
- **Дорожная карта (7 планов):** `docs/superpowers/plans/2026-10-01-roadmap.md`.
- **План 1 — фундамент** (`docs/superpowers/plans/2026-10-01-plan-1-foundation.md`) → PR #1 + PR #2 (бренд BigOffer, en по умолчанию). Монорепо pnpm/Turborepo, `packages/core`, `packages/db`, `apps/web` (Next.js 16, next-intl uk/ru/en, темы, Supabase-вход magic link token-hash, оболочка, профиль), миграции + pgTAP, Playwright E2E, CI.
- **План 2 — конвейер вакансий** (`docs/superpowers/plans/2026-10-02-plan-2-ingestion.md`) → PR #3. `packages/scrapers` (9 адаптеров), `apps/jobs` (pipeline: save/dedupe/match/source health/sync/expiry, Trigger.dev задачи, CLI `run-once`), `/search` настройки, временный список на `/today`.
- **План 3 — новые площадки + выбор галочками** (`docs/superpowers/plans/2026-10-03-plan-3-sources.md`) → PR #4. 16 площадок (добавлены Work.ua/OLX через Playwright, LinkedIn guest beta, Arbeitnow, Jobicy, Working Nomads, Just Join IT), `SOURCE_CATALOG` в `packages/core/src/jobs/sources.ts`, `search_profiles.sources`, UI «Где искать», README с локальной установкой.
- **Все PR #1–#4: CI зелёный**, стек: #1 → #2 → #3 → #4 (база каждого — предыдущая ветка). Пользователь сливает сам.
- Локальные проверки на HEAD: core 153, scrapers 55, web 9 unit; pgTAP 68; jobs integration 26; E2E 38.

## В работе / не закончено

- **План 4 (AI-слой + обогащение) — только начат исследованием, план НЕ написан.** Пользователь ответил «yes» на старт Плана 4 на бесплатном Gemini. Остановились на изучении SDK `@google/genai` 2.27.0: структурированный вывод через `config.responseMimeType: 'application/json'` + `responseJsonSchema`/`responseSchema`; клиент `GoogleGenAI`, `ai.models.generateContent`, ошибки `ApiError { status }`.
- Ключи Gemini у пользователя ещё не получены (нужны `GEMINI_API_KEY_PUBLIC` — бесплатный, aistudio.google.com; приватный платный — позже, к Плану 6). Ключи в чат не присылать, класть в `apps/jobs/.env` (gitignored).

## Ключевые решения

- Git-flow: работа в `feat/*` ветках → PR в `develop`; только пользователь сливает (и `develop` → `main` при деплое). Репо приватный `Volodymyr-FullStack-Pro/bigoffer`, default branch `develop`; защита веток недоступна на бесплатном GitHub (нужен Pro).
- Стек: Next.js 16 (`proxy.ts`), TypeScript **6.0.3** (не 7 — typescript-eslint), Supabase (RLS на всём, конвенция: revoke → grant → RLS; только новые миграции), Trigger.dev 4.6.4, Playwright 1.63.0, Zod 4.
- AI: провайдер-агностичный `packages/ai`, Gemini; **бесплатный ключ только для публичных данных** (вакансии), личные данные (CV, переписка, скриншоты, письма) — только платный ключ без обучения.
- LinkedIn — только guest-endpoint, бета, выключен по умолчанию. Пароли площадок не храним. Почта — несколько ящиков (Gmail/Outlook OAuth, пересылка) — План 7. Автопилот анализа по умолчанию выключен.
- Скоринг ключевыми словами работает без AI; AI улучшает (План 4).
- Домен `getbigoffer.com` не куплен (купить перед продом, Cloudflare Registrar).

## Следующие шаги

1. Написать **План 4** (`docs/superpowers/plans/2026-10-0X-plan-4-ai-enrichment.md`) на ветке `feat/plan-4-ai` от `feat/plan-3-sources`. Предлагаемый объём:
   - `packages/ai`: `LlmClient` (generateJson по Zod-схеме, изображения, `sensitivity: public|private`), реализация Gemini (`@google/genai`), env `AI_PROVIDER`, `AI_MODEL_PUBLIC` (напр. `gemini-3.5-flash-lite`), `GEMINI_API_KEY_PUBLIC/PRIVATE`; без приватного ключа — ошибка «недоступно», не фолбэк на бесплатный.
   - Обогащение: только вакансии, у которых есть совпадения (экономия), Trigger-задача `enrich-jobs` (каждые 15 мин, очередь concurrency 1, обработка 429/retry-after, дневной лимит `AI_DAILY_LIMIT`, таблица учёта использования). Выход: role, seniority, skills, salary {min,max,currency,period}, remote_type, гео-пригодность remote (`remote_regions`), язык, summary {uk,ru,en}, `is_job` (отсев мусора). Обновление jobs (не перетирать хорошие данные) + рескоринг через `upsert_job_matches`; `is_job=false` → убрать 'new' совпадения.
   - Скоринг: учесть AI-навыки и гео-ограничения remote (пользователь из UA/Европы).
   - «Почему подходит» для топ-20/день на языке пользователя; показать summary + why на `/today`.
   - Тесты с фейковым LlmClient; smoke-скрипт с живым ключом.
2. Выполнить План 4 через subagent-driven-development (скрипты в `~/.claude/plugins/cache/superpowers-marketplace/superpowers/6.3.0/skills/subagent-driven-development/scripts/`: `sdd-workspace`, `task-brief`, `review-package`), открыть PR #5 поверх #4.
3. Далее по дорожной карте: План 5 (лента со свайпами + умная доска, React Bits), 6 (отклик/рекрутеры/онбординг/Telegram), 7 (почта/анализ/аналитика).

## Заметки и подводные камни

- **Порт 3000 занят** другим локальным Next-приложением пользователя — E2E запускать с `E2E_PORT=3100`; dev-серверы гасить по PID, чужой процесс не трогать.
- Локально: OrbStack (Docker) + Supabase CLI 2.119 (brew), `gh` авторизован. `pnpm db:env` пишет `apps/web/.env.local` и `apps/jobs/.env.local` (запускать из корня). Chromium для Playwright: `pnpm --filter @jp/scrapers exec playwright install chromium`.
- В локальной БД есть демо-пользователи/профили и данные живых прогонов; старые Just Join IT зарплаты с «Year» могут быть дважды поделены (локально) — `supabase db reset` чистит.
- `supabase-js .in()` не экранирует кавычки — для значений с `,`/`"` строить фильтр вручную (см. `apps/jobs/src/pipeline/sync-profiles.ts`).
- Trigger.dev ключей у пользователя пока нет: `trigger dev`/`deploy --dry-run` не проверены (нужен `trigger login`); локально всё работает через `pnpm --filter @jp/jobs run-once --force [--source=<id>]`.
- Отложенные мелочи (из ревью): селекторы Work.ua/OLX хрупкие; Work.ua/OLX без локации; HN «Multiple roles»; украинские почасовые ставки не распознаются (AI в Плане 4 должен перекрыть зарплаты); матчинг новых вакансий только по запросам профиля (не против всех профилей).
- Память Claude (`~/.claude/projects/.../memory/`) содержит: проект, стиль работы (ответы на русском, выбирать лучший вариант самому, согласование по этапам), git-flow, React Bits, название/домен, решения от 2026-10-03.
