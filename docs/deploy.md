# Деплой BigOffer: інструкція для власника

Покроковий гайд, як винести BigOffer у продакшн на безкоштовних тарифах. Ставте галочки по мірі виконання.

## 1. Огляд

| Частина | Де живе | Навіщо |
| --- | --- | --- |
| Веб-застосунок (`apps/web`) | Vercel | інтерфейс, API, вхід |
| База, авторизація, сховище CV | Supabase Cloud | Postgres, Auth, Storage |
| Фонові задачі (`apps/jobs`) | Trigger.dev Cloud | збір вакансій, AI-збагачення, розклади |
| Автодеплой | GitHub Actions (`.github/workflows/deploy.yml`) | міграції Supabase, потім задачі Trigger.dev при пуші в `main` |

Безкоштовні тарифи та ліміти (станом на 2026-10):

- **Vercel Hobby** — лише для некомерційного використання.
- **Supabase Free** — 2 проєкти, 500 МБ бази, 1 ГБ сховища; проєкт засинає після 7 днів без активності.
- **Trigger.dev Free** — $5 кредиту на місяць, 20 одночасних запусків, 10 розкладів (у нас 4), логи зберігаються 1 день.
- **Resend Free** — 3 000 листів на місяць, 100 на день; щоб слати на довільні адреси, потрібен верифікований домен.

Розклади Trigger.dev (4): `schedule-queries` щогодини о :05, `enrich-jobs` кожні 15 хвилин, `explain-matches` щогодини о :40, `expire-jobs` (разом із пошуком нових дошок компаній) щодня о 03:00 UTC.

## 2. Supabase Cloud

- [ ] Створіть проєкт на supabase.com, регіон **Frankfurt (`eu-central-1`)**. Збережіть **пароль бази даних**.
- [ ] Зі сторінки проєкту візьміть: **Project URL**, **publishable key**, **secret key** (Project Settings → API Keys) і **project ref** (частина адреси `https://<project-ref>.supabase.co`).
- [ ] Authentication → URL Configuration: **Site URL** = `https://<vercel-адреса>`, **Redirect URLs** = `https://<vercel-адреса>/**`. Якщо адреси Vercel ще немає, поверніться сюди після кроку 6.
- [ ] Authentication → Email Templates: Cloud не отримує шаблони з `config.toml` через `db push`, а вхід за magic-link і підтвердження пошти працюють лише з шаблонами, що використовують `token_hash`. Вставте вміст файлів: `supabase/templates/magic_link.html` у шаблон **Magic link** (тема `Your sign-in link`), `supabase/templates/confirmation.html` у шаблон **Confirm signup** (тема `Confirm your email`). Рекомендовано вставляти вручну. Альтернатива: `supabase config push --project-ref <ref>` надсилає auth-налаштування з `config.toml`, але там значення для localhost (site_url, redirects), тому після нього обов'язково перевірте Site URL і Redirect URLs.
- [ ] Settings → API (Data API): залиште Data API **увімкненим** зі схемою `public` у Exposed schemas і залиште типові привілеї / автоматичне відкриття нових таблиць. Конвеєр вакансій спирається на типові гранти для `service_role`.
- [ ] Google-вхід: у Google Cloud Console створіть OAuth client типу **Web application**, у **Authorized redirect URIs** додайте `https://<project-ref>.supabase.co/auth/v1/callback`. У Supabase: Authentication → Providers → Google — увімкніть і вставте Client ID та Client Secret. На екрані згоди (OAuth consent screen) виберіть **User type = External** і натисніть **Publish app**: у режимі Testing увійти можуть лише додані тестові користувачі.
- [ ] Account → Access Tokens: створіть **access token** (для GitHub Actions).

Вхід за magic-link без власного SMTP має жорсткі ліміти на листи і призначений лише для тестів. На старті основний спосіб входу — Google.

## 3. Gemini

- [ ] **Безкоштовний ключ** (публічні дані: збагачення вакансій) — створіть в Google AI Studio. Піде в Trigger.dev як `GEMINI_API_KEY_PUBLIC`.
- [ ] **Платний ключ** (особисті дані: CV, листи, повідомлення рекрутерам) — створіть окремий проєкт у Google Cloud з увімкненим білінгом і ключем Gemini API. Налаштуйте **Budget alert на $5**. Піде у Vercel як `GEMINI_API_KEY_PRIVATE`.
- Ніколи не вставляйте безкоштовний ключ у Vercel як приватний: на безкоштовному тарифі Google може використовувати дані для навчання.

## 4. Trigger.dev Cloud

- [ ] Створіть проєкт, візьміть **project ref** (`proj_…`) і **Personal Access Token** (Account → Personal Access Tokens).
- [ ] Project → Environment Variables (середовище **Production**), додайте: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY_PUBLIC`, `JOOBLE_API_KEY` (якщо є), `ADZUNA_APP_ID` і `ADZUNA_APP_KEY` (якщо є), `SCRAPE_INTERVAL_MULTIPLIER` (необов'язково, за замовчуванням 1), `AI_DAILY_LIMIT` (необов'язково, за замовчуванням 900).
- [ ] Візьміть **`TRIGGER_SECRET_KEY`** для Production (Project → API Keys) — він піде у Vercel.

### Jooble

- [ ] Ключ беруть на jooble.org/api/about (форма запиту API-ключа). Він іде в Trigger.dev як `JOOBLE_API_KEY`; з ключем джерело Jooble працює, без нього вимкнене.

### Adzuna

- [ ] На developer.adzuna.com → Register створіть акаунт і візьміть **App ID** та **App Key**. Вони йдуть у Trigger.dev як `ADZUNA_APP_ID` і `ADZUNA_APP_KEY`.
- Adzuna — офіційний API: шукає по країнах pl, de, gb, nl запитом «<термін> remote» кожні 6 годин. Без обох ключів джерело вимкнене.

### Множник частоти

`SCRAPE_INTERVAL_MULTIPLIER` (число ≥ 1, за замовчуванням 1) множить інтервали опитування джерел: 1 — як є, 2 — удвічі рідше й приблизно удвічі дешевше. Менше за 1 або некоректне значення рахується як 1.

### Як стежити за витратами Trigger.dev

- Типова машина задач — `micro`; `sync-profile`, `schedule-queries` і `expire-jobs` працюють на `small-1x`, а браузерні джерела (Work.ua, OLX, LinkedIn) на `small-2x` на запуск. Якщо задачі не вистачає пам'яті, вона автоматично повторюється на `small-1x`.
- Dashboard → Usage показує витрати за місяць проти $5 безкоштовного кредиту.
- Якщо за перший тиждень витрачено понад $1.2, поставте `SCRAPE_INTERVAL_MULTIPLIER=2` у Trigger.dev (Environment Variables) і задеплойте задачі знову.

## 5. GitHub

Repository → Settings → Secrets and variables → Actions.

- [ ] **Secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `TRIGGER_ACCESS_TOKEN` (Personal Access Token з кроку 4).
- [ ] **Variables**: `TRIGGER_PROJECT_REF` (`proj_…`).

## 6. Vercel

- [ ] Add New → Project → Import Git Repository. **Root Directory** = `apps/web`, **Framework** = Next.js, **Production Branch** = `main`.
- [ ] Settings → Functions → **Function Region** = `fra1` (Frankfurt), поруч із Supabase `eu-central-1`. Settings → General → **Node.js Version** = `24.x`.
- [ ] Environment Variables: додайте їх лише для середовища **Production**. Ніколи не копіюйте прод-змінні у Preview. Прев'ю-деплої без змінних падатимуть, тому вимкніть їх (Settings → Git → Ignored Build Step або вимкніть Preview deployments) або ігноруйте. Змінні (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL` (= адреса Vercel), `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, `GEMINI_API_KEY_PRIVATE` (платний), `PRIVATE_AI_DAILY_LIMIT=100`, `TRIGGER_SECRET_KEY`.
- [ ] Після першого деплою, якщо адреса Vercel відрізняється від тієї, що ви вказали, оновіть `SITE_URL` у Vercel та Site URL і Redirect URLs у Supabase.

## 7. Перший запуск

- [ ] Злийте `develop` у `main` (це робите тільки ви).
- [ ] У GitHub → Actions перевірте, що workflow **deploy** зелений (job `migrate`, потім `trigger`).
- [ ] У Vercel перевірте, що деплой пройшов.
- [ ] У Trigger.dev з'явилися задачі та 4 розклади.
- [ ] Зареєструйтеся через Google, пройдіть онбординг із завантаженням CV.
- [ ] Приблизно через годину перевірте стрічку «Сьогодні»: мають з'явитися вакансії.

## 8. Пізніше: домен і Resend

- [ ] Купіть домен, додайте його у Vercel (Settings → Domains).
- [ ] Оновіть `SITE_URL` у Vercel і Site URL та Redirect URLs у Supabase. Робіть це разом: сайт треба завжди відкривати саме на хості з `SITE_URL` (`redirectTo` бере поточний origin, а callback перенаправляє на `SITE_URL`), інакше вхід закінчиться на іншому хості.
- [ ] Resend: додайте домен, пропишіть DNS-записи, створіть API key.
- [ ] Supabase → Authentication → SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = API key, sender `no-reply@<домен>`.

## 9. Таблиця змінних

| Змінна | Де | Звідки взяти | Обов'язкова? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Supabase → Project URL | так |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | Supabase → publishable key | так |
| `SITE_URL` | Vercel | адреса сайту на Vercel або свій домен | так |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | Vercel | `true` після налаштування Google у Supabase | так, для входу через Google |
| `TRIGGER_SECRET_KEY` | Vercel | Trigger.dev → API Keys (Production) | ні (миттєва пересинхронізація після збереження налаштувань пошуку) |
| `GEMINI_API_KEY_PRIVATE` | Vercel | Google Cloud, платний ключ | ні (без нього AI для CV і листів недоступний) |
| `AI_MODEL_PRIVATE` | Vercel | назва моделі, за замовчуванням `gemini-flash-latest` | ні |
| `PRIVATE_AI_DAILY_LIMIT` | Vercel | число, за замовчуванням 100 | ні |
| `SUPABASE_URL` | Trigger.dev | Supabase → Project URL | так |
| `SUPABASE_SECRET_KEY` | Trigger.dev | Supabase → secret key | так |
| `GEMINI_API_KEY_PUBLIC` | Trigger.dev | AI Studio, безкоштовний ключ | так (для AI-збагачення) |
| `JOOBLE_API_KEY` | Trigger.dev | jooble.org/api/about | ні |
| `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` | Trigger.dev | developer.adzuna.com → Register | ні (без обох ключів Adzuna вимкнена) |
| `SCRAPE_INTERVAL_MULTIPLIER` | Trigger.dev | число ≥ 1, за замовчуванням 1; 2 — удвічі рідше й дешевше | ні |
| `AI_DAILY_LIMIT` | Trigger.dev | число, за замовчуванням 900 | ні |
| `AI_BATCH_SIZE`, `AI_MIN_INTERVAL_MS`, `AI_MODEL_PUBLIC`, `SCRAPER_USER_AGENT` | Trigger.dev | налаштування за потреби | ні |
| `SUPABASE_ACCESS_TOKEN` | GitHub (secret) | Supabase → Account → Access Tokens | так |
| `SUPABASE_DB_PASSWORD` | GitHub (secret) | пароль бази з кроку 2 | так |
| `SUPABASE_PROJECT_REF` | GitHub (secret) | Supabase project ref | так |
| `TRIGGER_ACCESS_TOKEN` | GitHub (secret) | Trigger.dev Personal Access Token | так |
| `TRIGGER_PROJECT_REF` | GitHub (variable) | Trigger.dev project ref `proj_…` | так |

## 10. Що робити, якщо…

- **Workflow впав на «Missing GitHub secret …»** — додайте вказаний secret або variable (крок 5) і перезапустіть workflow (Actions → deploy → Run workflow).
- **Вхід редіректить на localhost** — у Supabase → Authentication → URL Configuration виправте Site URL та Redirect URLs на адресу Vercel; перевірте `SITE_URL` у Vercel.
- **«AI unavailable»** — у Vercel немає `GEMINI_API_KEY_PRIVATE`. Додайте платний ключ і зробіть Redeploy.
- **Кредит Trigger.dev скінчився** — задачі стоять до 1-го числа наступного місяця. Зменшіть частоту розкладів (`apps/jobs/src/trigger`) або перейдіть на платний тариф.
- **Supabase заснув (7 днів без активності)** — відновіть проєкт у дашборді Supabase.
