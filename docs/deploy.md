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
- **Trigger.dev Free** — $5 кредиту на місяць, 20 одночасних запусків, 10 розкладів (у нас 6), логи зберігаються 1 день.
- **Resend Free** — 3 000 листів на місяць, 100 на день; щоб слати на довільні адреси, потрібен верифікований домен.

Розклади Trigger.dev (6): `schedule-queries` щогодини о :05, `enrich-jobs` кожні 15 хвилин, `explain-matches` щогодини о :40, `expire-jobs` (разом із пошуком нових дошок компаній) щодня о 03:00 UTC, `telegram-alerts` кожні 15 хвилин, `telegram-digest` щогодини о :05.

## 2. Supabase Cloud

- [ ] Створіть проєкт на supabase.com, регіон **Frankfurt (`eu-central-1`)**. Збережіть **пароль бази даних**. У формі створення залиште позначеними **Enable Data API** і **Automatically expose new tables** (конвеєр вакансій спирається на типові гранти `service_role`).
- [ ] Зі сторінки проєкту візьміть: **Project URL** (Project Settings → Data API або кнопка **Connect**), **publishable key** і **secret key** (Project Settings → API Keys) і **project ref** (частина адреси `https://<project-ref>.supabase.co`).
- [ ] Authentication → URL Configuration: **Site URL** = `https://<vercel-адреса>` (без кінцевого `/`), **Redirect URLs** = `https://<vercel-адреса>/**`. Якщо адреси Vercel ще немає, поверніться сюди після кроку 6.
- [ ] Authentication → Email Templates: на безкоштовному плані Supabase Cloud шаблони листів не можна редагувати без власного SMTP, тому нічого міняти не потрібно. Застосунок приймає посилання зі стандартних шаблонів (`{{ .ConfirmationURL }}` повертає на `/auth/confirm?code=…`, PKCE). Нюанс: посилання треба відкрити в тому самому браузері, де його запросили. Власні шаблони (`supabase/templates/magic_link.html` → **Magic link**, `supabase/templates/confirmation.html` → **Confirm signup**, з `token_hash`) стають необов'язковими після налаштування Resend SMTP (розділ 9); вони дозволяють відкривати посилання на іншому пристрої.
- [ ] Перевірка перед першим злиттям у `main`: Project Settings → Data API — Data API **увімкнений**, схема `public` є в Exposed schemas, типові привілеї / автоматичне відкриття нових таблиць не вимкнені. Конвеєр вакансій спирається на типові гранти для `service_role`.
- [ ] Google-вхід: у Google Cloud Console створіть OAuth client типу **Web application**, у **Authorized redirect URIs** додайте `https://<project-ref>.supabase.co/auth/v1/callback`. У Supabase: Authentication → Providers → Google — увімкніть і вставте Client ID та Client Secret. Екран згоди налаштовується в Google Auth Platform: **Branding** (назва застосунку, support email, authorized domain `<project-ref>.supabase.co`) і **Audience** (**User type = External**, потім **Publish app**: у режимі Testing увійти можуть лише додані тестові користувачі). Екран згоди показуватиме «continue to <project-ref>.supabase.co».
- [ ] Account → Access Tokens: створіть **access token** (для GitHub Actions).

Вхід за magic-link без власного SMTP має жорсткі ліміти на листи і призначений лише для тестів. На старті основний спосіб входу — Google.

## 3. Gemini

- [ ] **Безкоштовний ключ** (публічні дані: збагачення вакансій) — створіть в Google AI Studio. Піде в Trigger.dev як `GEMINI_API_KEY_PUBLIC`.
- [ ] **Платний ключ** (особисті дані: CV, листи, повідомлення рекрутерам) — створіть окремий проєкт у Google Cloud з увімкненим білінгом і ключем Gemini API. Налаштуйте **Budget alert на $5**. Піде у Vercel як `GEMINI_API_KEY_PRIVATE`.
- Ніколи не вставляйте безкоштовний ключ у Vercel як приватний: на безкоштовному тарифі Google може використовувати дані для навчання.

## 4. Trigger.dev Cloud

- [ ] Створіть проєкт, візьміть **project ref** (`proj_…`) і **Personal Access Token** (Account → Personal Access Tokens).
- [ ] Project → Environment Variables (середовище **Production**), додайте: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY_PUBLIC`, `JOOBLE_API_KEY` (якщо є), `SCRAPE_INTERVAL_MULTIPLIER=3` (див. розділ про витрати; за замовчуванням 1), `AI_DAILY_LIMIT` (необов'язково, за замовчуванням 900). `TELEGRAM_BOT_TOKEN` і `SITE_URL` тут не додавайте: їх разом задає розділ 8 (токен без `SITE_URL` змушує задачі Telegram падати).
- [ ] Візьміть **`TRIGGER_SECRET_KEY`** для Production (Project → API Keys) — він піде у Vercel.

### Jooble

- [ ] Ключ беруть на jooble.org/api/about (форма запиту API-ключа). Він іде в Trigger.dev як `JOOBLE_API_KEY`; з ключем джерело Jooble працює, без нього вимкнене.

### Adzuna

- Adzuna — офіційний API: шукає по країнах pl, de, gb, nl запитом «<термін> remote» кожні 6 годин. Без обох ключів джерело вимкнене. Безкоштовна квота ≈ 250 запитів на день, 1 000 на тиждень, 2 500 на місяць; один профіль витрачає ≈ 32 запити на день, тому кілька різних профілів можуть вичерпати квоту.

### Множник частоти

`SCRAPE_INTERVAL_MULTIPLIER` (число ≥ 1, за замовчуванням 1) множить інтервали опитування джерел: 1 — як є, 2 — удвічі рідше й приблизно удвічі дешевше. Менше за 1 або некоректне значення рахується як 1.

### Як стежити за витратами Trigger.dev

- Типова машина задач — `micro`; `sync-profile`, `schedule-queries` і `expire-jobs` працюють на `small-1x`, а браузерні джерела (Work.ua, OLX) на `small-2x` на запуск (LinkedIn працює через звичайний HTTP). Якщо задачі не вистачає пам'яті, браузерні задачі повторюються на `small-2x`, а решта на `small-1x`.
- Dashboard → Usage показує витрати за місяць проти $5 безкоштовного кредиту.
- Реалістична оцінка: ≈ $14–22 на місяць при множнику 1 для одного профілю, тобто значно більше за безкоштовні $5. Тому починайте з `SCRAPE_INTERVAL_MULTIPLIER=3` (Trigger.dev → Environment Variables; передеплоювати не потрібно, зміни змінних застосовуються до наступних запусків — якщо сумніваєтеся, Actions → deploy → Run workflow на `main`).
- Через 2–3 дні подивіться Usage і підберіть множник за формулою m ≈ ceil(тижнева змінна витрата / ($1.15 − ≈$0.6 фіксованих)).
- Множник фактично округлюється до погодинного тіку планувальника: 1.5× від 60 хв дає ≈ 2 год.
- Найбільші статті витрат — браузерні джерела Work.ua та OLX.
- Два розклади Telegram (`telegram-alerts` кожні 15 хв + `telegram-digest` щогодини) — це ≈ 3 600 коротких запусків на місяць (2 880 + 720) на `micro`, ≈ $0.2–0.3 на місяць. Без `TELEGRAM_BOT_TOKEN` вони одразу завершуються (`skipped: no token`), тож вартість — лише мінімальна плата за запуск.
- Альтернатива: платний тариф Trigger.dev, якщо потрібна погодинна свіжість.

## 5. GitHub

Repository → Settings → Secrets and variables → Actions.

- [ ] **Secrets**: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `TRIGGER_ACCESS_TOKEN` (Personal Access Token з кроку 4).
- [ ] **Variables**: `TRIGGER_PROJECT_REF` (`proj_…`).

## 6. Vercel

- [ ] Add New → Project → Import Git Repository. **Root Directory** = `apps/web`, **Framework** = Next.js. Гілка за замовчуванням у репозиторії — `develop`, тому імпортуйте проєкт **без змінних середовища**: перша збірка впаде, це очікувано.
- [ ] Settings → Environments → Production → **Branch Tracking** = `main`.
- [ ] Settings → Functions → **Function Region** = `fra1` (Frankfurt), поруч із Supabase `eu-central-1`. Settings → General → **Node.js Version** = `24.x`.
- [ ] Settings → Git → **Ignored Build Step** → «Only build production» (прев'ю-деплої без змінних падатимуть).
- [ ] Адресу Vercel візьміть у Settings → Domains і одразу використайте як `SITE_URL` (без кінцевого `/`).
- [ ] Settings → Environment Variables: додайте змінні, залишивши позначеним лише **Production**. Ніколи не копіюйте прод-змінні у Preview. Змінні (Production): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SITE_URL` (= адреса Vercel), `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=true`, `GEMINI_API_KEY_PRIVATE` (платний), `TRIGGER_SECRET_KEY`, а також змінні Telegram-бота з розділу 8 (разом із `SUPABASE_SECRET_KEY`, який вебу потрібен лише для вебхука `/api/telegram/webhook`). `PRIVATE_AI_DAILY_LIMIT` за замовчуванням 100, окремо задавати не обов'язково (див. розділ 10).
- Не натискайте Redeploy: перший справжній деплой станеться, коли ви злиєте `develop` у `main` (крок 7).
- Завжди відкривайте сайт лише на хості з `SITE_URL`: на прев'ю та гілкових адресах `*.vercel.app` вхід не працюватиме.
- [ ] Якщо після першого деплою адреса Vercel відрізняється від тієї, що ви вказали, оновіть `SITE_URL` у Vercel (потім Deployments → Redeploy) та Site URL і Redirect URLs у Supabase.

## 7. Перший запуск

- [ ] Злийте `develop` у `main` (це робите тільки ви). Vercel деплоїть паралельно з job `migrate`: якщо `migrate` упав, сайт працює на старій схемі — виправте причину й перезапустіть workflow (Actions → deploy → Run workflow).
- [ ] У GitHub → Actions перевірте, що workflow **deploy** зелений (job `migrate`, потім `trigger`).
- [ ] У Vercel перевірте, що деплой пройшов.
- [ ] У Trigger.dev з'явилися задачі та 6 розкладів.
- [ ] Зареєструйтеся через Google, пройдіть онбординг із завантаженням CV.
- [ ] Приблизно через годину перевірте стрічку «Сьогодні»: мають з'явитися вакансії.

## 8. Telegram-бот

- [ ] У Telegram відкрийте **@BotFather** → `/newbot` → вкажіть ім'я та username (має закінчуватися на `_bot`) → збережіть **токен**.
- [ ] Згенеруйте секрет вебхука: `openssl rand -hex 32` (це `TELEGRAM_WEBHOOK_SECRET`).
- [ ] Vercel (Production): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (username без `@`), `SUPABASE_SECRET_KEY` (тепер потрібен вебу, але лише для вебхука). Після додавання зробіть Deployments → Redeploy (`NEXT_PUBLIC_*` вбудовуються під час збірки).
- [ ] Trigger.dev (Production): `TELEGRAM_BOT_TOKEN`, `SITE_URL` (посилання «Відкрити» у сповіщеннях). Передеплоювати не потрібно: зміни змінних Trigger.dev застосовуються до наступних запусків (якщо сумніваєтеся, Actions → deploy → Run workflow на `main`). Токен без `SITE_URL` змусить задачі Telegram падати, тому додавайте обидві змінні разом.
- [ ] Одноразово зареєструйте вебхук:

```
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<домен>/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
  -d 'allowed_updates=["message","callback_query"]'
```

- [ ] Перевірте: `curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"` — `url` правильний, `last_error_message` порожній. Якщо змінюєте домен, зареєструйте вебхук заново.
- [ ] У BigOffer: Профіль → «Підключити Telegram» → у боті натисніть **Start**. Посилання дійсне 15 хвилин.

Як працює бот:

- `/stop` вимикає сповіщення; підключити знову можна з профілю.
- Кнопки під вакансією: **Відкрити**, **Сховати**, **Подав(ла)ся**.
- Сповіщення надсилаються про збіги не нижче порога користувача (за замовчуванням 75), не більше 5 за запуск, решта — рядком про залишок.
- Дайджест приходить у `digest_hour` за часовим поясом профілю; якщо година пропущена, цього ж дня він надсилається пізніше.
- Якщо користувач заблокував бота, зв'язок з акаунтом видаляється.

## 9. Пізніше: домен і Resend

- [ ] Купіть домен, додайте його у Vercel (Settings → Domains).
- [ ] Оновіть усе разом (без кінцевого `/`): `SITE_URL` у Vercel (потім Deployments → Redeploy, бо `NEXT_PUBLIC_*` вбудовуються під час збірки), `SITE_URL` у Trigger.dev, Site URL і Redirect URLs у Supabase, а також заново зареєструйте вебхук Telegram (розділ 8). Робіть це разом: сайт треба завжди відкривати саме на хості з `SITE_URL` (`redirectTo` бере поточний origin, а callback перенаправляє на `SITE_URL`), інакше вхід закінчиться на іншому хості.
- [ ] Resend: додайте домен, пропишіть DNS-записи, створіть API key.
- [ ] Supabase → Authentication → SMTP: host `smtp.resend.com`, port `465`, user `resend`, password = API key, sender `no-reply@<домен>`.

## 10. Таблиця змінних

| Змінна | Де | Звідки взяти | Обов'язкова? |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | Supabase → Project URL | так |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel | Supabase → publishable key | так |
| `SITE_URL` | Vercel | адреса сайту на Vercel або свій домен | так |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | Vercel | `true` після налаштування Google у Supabase (після зміни — Deployments → Redeploy) | так, для входу через Google |
| `TRIGGER_SECRET_KEY` | Vercel | Trigger.dev → API Keys (Production) | ні (миттєва пересинхронізація після збереження налаштувань пошуку) |
| `GEMINI_API_KEY_PRIVATE` | Vercel | Google Cloud, платний ключ | ні (без нього AI для CV і листів недоступний) |
| `AI_MODEL_PRIVATE` | Vercel | назва моделі, за замовчуванням `gemini-flash-latest` | ні |
| `PRIVATE_AI_DAILY_LIMIT` | Vercel | число, за замовчуванням 100 | ні |
| `SUPABASE_SECRET_KEY` | Vercel | Supabase → secret key (service role; лише для вебхука Telegram) | так, для Telegram |
| `TELEGRAM_BOT_TOKEN` | Vercel, Trigger.dev | @BotFather → `/newbot` | ні (без нього Telegram вимкнений) |
| `TELEGRAM_WEBHOOK_SECRET` | Vercel | `openssl rand -hex 32` | так, для Telegram |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Vercel | username бота без `@` | так, для Telegram |
| `SITE_URL` | Trigger.dev | адреса сайту (для посилань у сповіщеннях) | так, для Telegram |
| `SUPABASE_URL` | Trigger.dev | Supabase → Project URL | так |
| `SUPABASE_SECRET_KEY` | Trigger.dev | Supabase → secret key | так |
| `GEMINI_API_KEY_PUBLIC` | Trigger.dev | AI Studio, безкоштовний ключ | так (для AI-збагачення) |
| `JOOBLE_API_KEY` | Trigger.dev | jooble.org/api/about | ні |
| `SCRAPE_INTERVAL_MULTIPLIER` | Trigger.dev | число ≥ 1, за замовчуванням 1; 2 — удвічі рідше й дешевше | ні |
| `AI_DAILY_LIMIT` | Trigger.dev | число, за замовчуванням 900 | ні |
| `AI_BATCH_SIZE`, `AI_MIN_INTERVAL_MS`, `AI_MODEL_PUBLIC`, `SCRAPER_USER_AGENT` | Trigger.dev | налаштування за потреби | ні |
| `SUPABASE_ACCESS_TOKEN` | GitHub (secret) | Supabase → Account → Access Tokens | так |
| `SUPABASE_DB_PASSWORD` | GitHub (secret) | пароль бази з кроку 2 | так |
| `SUPABASE_PROJECT_REF` | GitHub (secret) | Supabase project ref | так |
| `TRIGGER_ACCESS_TOKEN` | GitHub (secret) | Trigger.dev Personal Access Token | так |
| `TRIGGER_PROJECT_REF` | GitHub (variable) | Trigger.dev project ref `proj_…` | так |

## 11. Що робити, якщо…

- **Workflow впав на «Missing GitHub secret …»** — додайте вказаний secret або variable (крок 5) і перезапустіть workflow (Actions → deploy → Run workflow).
- **Вхід редіректить на localhost** — у Supabase → Authentication → URL Configuration виправте Site URL та Redirect URLs на адресу Vercel; перевірте `SITE_URL` у Vercel (без кінцевого `/`; після зміни Deployments → Redeploy).
- **«AI unavailable»** — у Vercel немає `GEMINI_API_KEY_PRIVATE`. Додайте платний ключ і зробіть Deployments → Redeploy.
- **Кредит Trigger.dev скінчився** — задачі стоять до 1-го числа наступного місяця. Зменшіть частоту розкладів (`apps/jobs/src/trigger`) або перейдіть на платний тариф.
- **Supabase заснув (7 днів без активності)** — відновіть проєкт у дашборді Supabase.
- **`pnpm install` падає на Vercel** — додайте змінну `ENABLE_EXPERIMENTAL_COREPACK=1` (Production) і зробіть Deployments → Redeploy.
