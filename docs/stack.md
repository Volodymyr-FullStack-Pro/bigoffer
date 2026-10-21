# Що використовується в BigOffer і навіщо

Коротка карта проєкту. Як усе розгорнуто й налаштовано — у [deploy.md](deploy.md).

## Код

| Частина | Що це | Навіщо |
| --- | --- | --- |
| `apps/web` | Next.js 16 (App Router), React, Tailwind v4 | інтерфейс: стрічка, дошка, підготовка, бібліотека, аналітика, профіль; серверні дії та API |
| `apps/jobs` | задачі Trigger.dev v4 | збір вакансій за розкладом, AI-збагачення, нагадування, Telegram-дайджести |
| `packages/scrapers` | адаптери DOU, Djinni, robota.ua (cheerio, fast-xml-parser) | читають сторінки й RSS бірж і зводять вакансії до одного формату |
| `packages/core` | чиста логіка без мережі | нормалізація, зарплати, скоринг збігу, терміновість карток, бекоф запитів |
| `packages/ai` | клієнт LLM і AI-задачі | опис вакансії, «чому підходить», листи, відповіді рекрутерам, підготовка до інтерв'ю |
| `packages/db` | типи Supabase | типізовані запити до бази |
| Монорепо | pnpm + Turborepo | один репозиторій, спільні пакети, кешовані збірки |

## Сервіси

| Сервіс | Навіщо |
| --- | --- |
| **Vercel** | хостинг веб-застосунку; щоденний cron watchdog (`/api/cron/watchdog`): пише в Telegram, якщо збір вакансій став |
| **Supabase** | Postgres із RLS (кожен бачить лише своє), вхід (email, Google), сховище CV; міграції в `supabase/migrations`, тести pgTAP |
| **Trigger.dev** (Hobby, $10) | фонові задачі й розклади: Djinni кожні 30 хв, DOU щогодини, robota.ua кожні 4 год; «радар» кожні 2 хв читає RSS Djinni і DOU і нову вакансію збирає, обробляє й надсилає в Telegram за 2–5 хв |
| **GitHub Actions** | CI на PR (lint, типи, юніт-тести, база, e2e); деплой при пуші в `main`: міграції → задачі Trigger.dev |
| **Gemini (публічний ключ)** | AI лише над даними вакансії (опис, план підготовки, уроки) |
| **OpenRouter (приватний)** | AI над особистими даними (CV, листи, відповіді рекрутерам); особисті дані ніколи не йдуть у безкоштовний Gemini |
| **Telegram-бот** | сповіщення про нові збіги, дайджест, нагадування |
| **Tavily / Serper / Brave** (необов'язково) | пошук рекрутерів компанії для «Написати рекрутеру» |

## Дизайн

| Що | Навіщо |
| --- | --- |
| Токени в `apps/web/src/app/globals.css` | кольори статусів (`--status-interview/move/wait/test/offer/danger/neutral`), світла й темна теми |
| `components/ui/status-badge.tsx` | один вигляд бейджів: `StatusBadge`, `toneChip` |
| lucide-react | іконки |
| motion | анімації (свайп карток на телефоні) |
| React Bits, Aceternity | окремі ефекти (світіння карток, поява тексту) |
| shadcn CLI + MCP (`apps/web/components.json`, `.mcp.json`) | готові компоненти з реєстрів React Bits, Magic UI, Aceternity: `npx shadcn@latest add @magicui/<name>`; Claude Code бачить їх через MCP-сервер `shadcn` |
| tweakcn (tweakcn.com) | візуальний редактор теми: підібрати кольори й радіуси, потім перенести токени в `globals.css` |
| next-intl | мови uk / ru / en (`apps/web/messages`) |

## Якість і аналітика

| Інструмент | Що показує | Де дивитися |
| --- | --- | --- |
| **Vitest** | юніт-тести логіки | `pnpm test` |
| **Playwright** | e2e на комп'ютері й телефоні | `pnpm --filter @jp/web test:e2e` |
| **axe** (`e2e/a11y.spec.ts`) | доступність усіх основних екранів; CI падає на критичних проблемах | лог e2e у CI |
| **Lighthouse** | швидкість, доступність, SEO сторінки | `pnpm --filter @jp/web audit:lighthouse` (інша сторінка: `LH_URL=...`) |
| **Vercel Speed Insights** | реальна швидкість завантаження у користувачів | Vercel → проєкт → Speed Insights |
| **Microsoft Clarity** | теплові карти кліків і прокрутки, записи сесій; текст усередині застосунку замаскований | clarity.microsoft.com; вмикається змінною `NEXT_PUBLIC_CLARITY_ID` |
| Health-перевірки | чи кожна біржа віддає вакансії і чи не пропущено запуски | задача health у Trigger.dev, watchdog у Telegram |
