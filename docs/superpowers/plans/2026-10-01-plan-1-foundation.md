# План 1 — Фундамент: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий каркас платформы: монорепо, Next.js 16 с фирменным стилем и темами, интерфейс на uk/ru/en, Supabase-схема пользователя с RLS, вход, оболочка приложения с навигацией, страница профиля, E2E и CI.

**Architecture:** pnpm + Turborepo монорепо. `apps/web` (Next.js 16 App Router) содержит только UI и тонкие серверные действия; чистая логика — в `packages/core` (TDD, Vitest); типы БД и service-клиент — в `packages/db`. Supabase локально через CLI + Docker; схема в SQL-миграциях, RLS проверяется pgTAP-тестами. Локаль — сегмент URL `[locale]` (next-intl), сессия Supabase обновляется в `proxy.ts`.

**Tech Stack:** Node 24, pnpm 12.4.1, Turborepo 2.11, TypeScript 6.0.3, Next.js 16.3, React 19.3, Tailwind CSS 4.3, next-intl 4.14, next-themes 0.4, @supabase/ssr 0.12, @supabase/supabase-js 2.117, Zod 4.6, Vitest 5, Playwright 1.63, lucide-react, Supabase CLI 2.119.

**Spec:** `docs/superpowers/specs/2026-10-01-job-platform-mvp-design.md` (дорожная карта: `docs/superpowers/plans/2026-10-01-roadmap.md`)

## Global Constraints

- Node 24.x, pnpm 12.4.1 (`packageManager` в корневом `package.json`).
- TypeScript **6.0.3** точно (typescript-eslint требует `<6.1.0`); `strict: true`, `noUncheckedIndexedAccess: true`.
- Next.js 16: файл перехвата запросов — `src/proxy.ts` (не `middleware.ts`); `params` в layout/page — `Promise`.
- Внутренние пакеты имеют scope `@jp/` и экспортируют TS-исходники напрямую (`transpilePackages` в Next).
- Локали: `uk`, `ru`, `en`; `defaultLocale: 'uk'`; `localePrefix: 'always'`.
- Цвета: светлый фон `#F4F1E8`, тёмный фон `oklch(16% 0 0)`, бренд-акцент `#C6F432`, AI-акцент `#7B5CFF`.
- Шрифты (subsets `latin` + `cyrillic`): Unbounded — заголовки, Onest — текст, JetBrains Mono — мета.
- Темы: light / dark / system через `next-themes`, `attribute="class"`.
- Каждая таблица в `public` — `enable row level security`; пользовательские политики пишутся как `user_id = (select auth.uid())`.
- Все внешние входы (формы, env) валидируются Zod.
- Секретный ключ Supabase никогда не попадает в клиентский код и в `NEXT_PUBLIC_*`.
- Личные файлы `docs/*.pdf`, `docs/*.rtf` не коммитятся (уже в `.gitignore`).
- Каждый коммит заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Структура файлов

```
job-parser/
├── package.json                 # корневые скрипты, packageManager
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .nvmrc  .prettierrc
├── scripts/supabase-env.sh      # пишет apps/web/.env.local из `supabase status`
├── .github/workflows/ci.yml
├── packages/
│   ├── core/src/
│   │   ├── index.ts
│   │   ├── i18n/locales.ts              # LOCALES, Locale, isLocale
│   │   ├── i18n/localized.ts            # localized(field, locale) с фолбэком
│   │   ├── i18n/message-keys.ts         # flattenKeys, findMissingKeys
│   │   ├── nav/safe-redirect.ts         # safeRedirectPath
│   │   └── profile/profile-schema.ts    # emptyToUndefined, profileUpdateSchema
│   └── db/src/
│       ├── index.ts
│       ├── database.types.ts            # генерируется `pnpm db:types`
│       └── service-client.ts            # createServiceClient (для воркеров)
├── supabase/
│   ├── config.toml                      # генерируется `supabase init`, правится
│   ├── migrations/20261001000100_foundation.sql
│   ├── seed.sql
│   └── tests/database/001_foundation.test.sql
└── apps/web/
    ├── next.config.ts  playwright.config.ts  vitest.config.ts
    ├── messages/{uk,ru,en}.json
    ├── e2e/{helpers/auth.ts, auth.spec.ts, shell.spec.ts, profile.spec.ts}
    └── src/
        ├── proxy.ts
        ├── env.ts
        ├── i18n/{routing.ts, navigation.ts, request.ts}
        ├── i18n/messages.test.ts
        ├── lib/supabase/{server.ts, browser.ts, proxy.ts}
        ├── app/
        │   ├── globals.css                       # токены, фактура, .brutal
        │   ├── fonts.ts
        │   ├── auth/callback/route.ts
        │   └── [locale]/
        │       ├── layout.tsx  page.tsx  providers.tsx
        │       ├── (auth)/login/{page.tsx, actions.ts, login-form.tsx, google-button.tsx}
        │       └── (app)/
        │           ├── layout.tsx  actions.ts
        │           ├── today/page.tsx  board/page.tsx  analytics/page.tsx  prep/page.tsx
        │           └── profile/{page.tsx, actions.ts, profile-form.tsx}
        └── components/
            ├── ui/{button.tsx, coming-soon.tsx}
            ├── theme-toggle.tsx  locale-switcher.tsx
            └── shell/{nav-items.ts, nav-link.tsx, sidebar.tsx, bottom-nav.tsx, header.tsx}
```

---

### Task 0: Предусловия окружения (выполняет пользователь)

Docker и Supabase CLI отсутствуют на машине. Supabase локально работает только с Docker.

- [ ] **Step 1: Установить Docker-рантайм и Supabase CLI**

```bash
brew install --cask orbstack
brew install supabase/tap/supabase
open -a OrbStack
```

- [ ] **Step 2: Проверить**

Run: `docker info --format '{{.ServerVersion}}' && supabase --version`
Expected: версия Docker и `2.119.x` (или новее).

---

### Task 1: Каркас монорепо

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.nvmrc`, `.prettierrc`
- Modify: `.gitignore`

**Interfaces:**
- Produces: корневые скрипты `dev`, `build`, `lint`, `typecheck`, `test`, `db:start`, `db:reset`, `db:test`, `db:types`, `db:env`; базовый `tsconfig.base.json`, который расширяют все пакеты.

- [ ] **Step 1: Создать корневые файлы**

`package.json`:
```json
{
  "name": "job-parser",
  "private": true,
  "packageManager": "pnpm@12.4.1",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "typecheck": "turbo typecheck",
    "test": "turbo test",
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "db:test": "supabase test db",
    "db:types": "supabase gen types typescript --local > packages/db/src/database.types.ts",
    "db:env": "bash scripts/supabase-env.sh"
  },
  "devDependencies": {
    "prettier": "^3.6.0",
    "turbo": "^2.11.6",
    "typescript": "6.0.3"
  }
}
```

`pnpm-workspace.yaml`:
```yaml
packages:
  - apps/*
  - packages/*
```

`turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": {},
    "test": {}
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

`.nvmrc`:
```
24
```

`.prettierrc`:
```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

В `.gitignore` дописать в конец:
```
.env.local
supabase/.temp/
supabase/.branches/
playwright-report/
test-results/
coverage/
```

- [ ] **Step 2: Установить и проверить**

Run: `pnpm install && pnpm turbo --version`
Expected: установка без ошибок, вывод `2.11.x`.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml turbo.json tsconfig.base.json .nvmrc .prettierrc .gitignore pnpm-lock.yaml
git commit -m "chore: scaffold pnpm + turborepo monorepo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: `packages/core` — локали и локализованные поля

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/i18n/locales.ts`, `packages/core/src/i18n/localized.ts`
- Test: `packages/core/src/i18n/localized.test.ts`

**Interfaces:**
- Produces:
  - `LOCALES: readonly ['uk', 'ru', 'en']`, `type Locale = 'uk' | 'ru' | 'en'`, `DEFAULT_LOCALE: 'uk'`, `isLocale(value: unknown): value is Locale`
  - `type LocalizedText = Partial<Record<Locale, string>>`
  - `localized(field: LocalizedText | null | undefined, locale: Locale): string` — порядок: запрошенная локаль → `en` → первое непустое значение → `''`.

- [ ] **Step 1: Создать пакет**

`packages/core/package.json`:
```json
{
  "name": "@jp/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "zod": "^4.6.5" },
  "devDependencies": { "typescript": "6.0.3", "vitest": "^5.0.3" }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM"], "types": [] },
  "include": ["src"]
}
```

Run: `pnpm install`

- [ ] **Step 2: Написать падающий тест**

`packages/core/src/i18n/localized.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { isLocale, LOCALES } from './locales';
import { localized } from './localized';

describe('isLocale', () => {
  it('accepts supported locales', () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
  });
  it('rejects anything else', () => {
    expect(isLocale('de')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('localized', () => {
  it('returns the requested locale', () => {
    expect(localized({ uk: 'Збережено', ru: 'Сохранено', en: 'Saved' }, 'ru')).toBe('Сохранено');
  });
  it('falls back to en when requested locale is missing', () => {
    expect(localized({ en: 'Saved' }, 'uk')).toBe('Saved');
  });
  it('treats empty strings as missing', () => {
    expect(localized({ uk: '', en: 'Saved' }, 'uk')).toBe('Saved');
  });
  it('falls back to the first non-empty value', () => {
    expect(localized({ ru: 'Сохранено' }, 'uk')).toBe('Сохранено');
  });
  it('returns empty string for null, undefined or empty object', () => {
    expect(localized(null, 'uk')).toBe('');
    expect(localized(undefined, 'uk')).toBe('');
    expect(localized({}, 'uk')).toBe('');
  });
});
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `pnpm --filter @jp/core test`
Expected: FAIL — `Failed to resolve import "./locales"`.

- [ ] **Step 4: Реализация**

`packages/core/src/i18n/locales.ts`:
```ts
export const LOCALES = ['uk', 'ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'uk';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
```

`packages/core/src/i18n/localized.ts`:
```ts
import type { Locale } from './locales';

export type LocalizedText = Partial<Record<Locale, string>>;

function nonEmpty(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export function localized(field: LocalizedText | null | undefined, locale: Locale): string {
  if (!field) return '';
  return (
    nonEmpty(field[locale]) ??
    nonEmpty(field.en) ??
    Object.values(field).find((v): v is string => nonEmpty(v) !== undefined) ??
    ''
  );
}
```

`packages/core/src/index.ts`:
```ts
export * from './i18n/locales';
export * from './i18n/localized';
```

- [ ] **Step 5: Тесты проходят**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS (8 tests), typecheck без ошибок.

- [ ] **Step 6: Commit**

```bash
git add packages/core pnpm-lock.yaml
git commit -m "feat(core): add locales and localized field helper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `packages/core` — сверка ключей переводов и безопасный редирект

**Files:**
- Create: `packages/core/src/i18n/message-keys.ts`, `packages/core/src/nav/safe-redirect.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/i18n/message-keys.test.ts`, `packages/core/src/nav/safe-redirect.test.ts`

**Interfaces:**
- Produces:
  - `flattenKeys(messages: Record<string, unknown>, prefix?: string): string[]` — пути листьев через точку, отсортированы.
  - `findMissingKeys(base: Record<string, unknown>, other: Record<string, unknown>): string[]` — ключи `base`, которых нет в `other`.
  - `safeRedirectPath(next: string | null | undefined): string | null` — возвращает путь только если он начинается с одного `/`, не содержит `//` в начале, `\` и `://`; иначе `null`.

- [ ] **Step 1: Падающие тесты**

`packages/core/src/i18n/message-keys.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { findMissingKeys, flattenKeys } from './message-keys';

describe('flattenKeys', () => {
  it('flattens nested objects into sorted dot paths', () => {
    expect(flattenKeys({ nav: { today: 'a', board: 'b' }, app: 'x' })).toEqual([
      'app',
      'nav.board',
      'nav.today',
    ]);
  });
  it('returns empty array for empty object', () => {
    expect(flattenKeys({})).toEqual([]);
  });
});

describe('findMissingKeys', () => {
  it('lists keys present in base but absent in other', () => {
    const base = { nav: { today: 'a', board: 'b' }, app: 'x' };
    const other = { nav: { today: 'a' }, app: 'y' };
    expect(findMissingKeys(base, other)).toEqual(['nav.board']);
  });
  it('returns empty array when other has all keys', () => {
    expect(findMissingKeys({ a: { b: '1' } }, { a: { b: '2' }, c: '3' })).toEqual([]);
  });
});
```

`packages/core/src/nav/safe-redirect.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('accepts a local absolute path with query', () => {
    expect(safeRedirectPath('/uk/today?x=1')).toBe('/uk/today?x=1');
  });
  it.each([null, undefined, '', 'uk/today', '//evil.com', '/\\evil.com', 'https://evil.com', '/x?u=https://evil.com'])(
    'rejects %s',
    (value) => {
      expect(safeRedirectPath(value)).toBeNull();
    },
  );
});
```

- [ ] **Step 2: Убедиться, что падают**

Run: `pnpm --filter @jp/core test`
Expected: FAIL — `Failed to resolve import "./message-keys"` и `"./safe-redirect"`.

- [ ] **Step 3: Реализация**

`packages/core/src/i18n/message-keys.ts`:
```ts
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function flattenKeys(messages: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) keys.push(...flattenKeys(value, path));
    else keys.push(path);
  }
  return keys.sort();
}

export function findMissingKeys(
  base: Record<string, unknown>,
  other: Record<string, unknown>,
): string[] {
  const otherKeys = new Set(flattenKeys(other));
  return flattenKeys(base).filter((key) => !otherKeys.has(key));
}
```

`packages/core/src/nav/safe-redirect.ts`:
```ts
export function safeRedirectPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith('/') || next.startsWith('//')) return null;
  if (next.includes('\\') || next.includes('://')) return null;
  return next;
}
```

`packages/core/src/index.ts` — добавить строки:
```ts
export * from './i18n/message-keys';
export * from './nav/safe-redirect';
```

- [ ] **Step 4: Тесты проходят**

Run: `pnpm --filter @jp/core test`
Expected: PASS (все тесты пакета).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add message key diff and safe redirect helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `packages/core` — схема обновления профиля

**Files:**
- Create: `packages/core/src/profile/profile-schema.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/profile/profile-schema.test.ts`

**Interfaces:**
- Produces:
  - `emptyToUndefined<T extends Record<string, unknown>>(input: T): { [K in keyof T]: T[K] | undefined }` — строки из одних пробелов/пустые → `undefined` (один уровень).
  - `isValidTimeZone(tz: string): boolean`
  - `contactsSchema` — `{ email?, phone?, linkedin?, github?, portfolio?, telegram? }`
  - `profileUpdateSchema` — `{ full_name: string (1..120, trim), timezone: string (IANA), contacts: Contacts }`
  - `type Contacts = z.infer<typeof contactsSchema>`, `type ProfileUpdate = z.infer<typeof profileUpdateSchema>`

- [ ] **Step 1: Падающий тест**

`packages/core/src/profile/profile-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { emptyToUndefined, isValidTimeZone, profileUpdateSchema } from './profile-schema';

describe('emptyToUndefined', () => {
  it('converts blank strings to undefined and keeps others', () => {
    expect(emptyToUndefined({ a: '', b: '  ', c: 'x', d: 5 })).toEqual({
      a: undefined,
      b: undefined,
      c: 'x',
      d: 5,
    });
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones', () => {
    expect(isValidTimeZone('Europe/Kyiv')).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('profileUpdateSchema', () => {
  const valid = {
    full_name: '  Volodymyr Babiichuk ',
    timezone: 'Europe/Kyiv',
    contacts: {
      email: 'me@example.com',
      phone: '+38 (068) 025 3147',
      linkedin: 'https://linkedin.com/in/someone',
      github: 'https://github.com/someone',
      telegram: '@someone',
    },
  };

  it('parses a valid profile and trims the name', () => {
    const result = profileUpdateSchema.parse(valid);
    expect(result.full_name).toBe('Volodymyr Babiichuk');
    expect(result.contacts.portfolio).toBeUndefined();
  });

  it('rejects an empty name', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, full_name: '  ' }).success).toBe(false);
  });

  it('rejects an invalid timezone', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, timezone: 'Nowhere' }).success).toBe(false);
  });

  it('rejects non-http links', () => {
    const bad = { ...valid, contacts: { ...valid.contacts, github: 'javascript:alert(1)' } };
    const result = profileUpdateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['contacts', 'github']);
  });

  it('rejects an invalid email', () => {
    const bad = { ...valid, contacts: { ...valid.contacts, email: 'nope' } };
    expect(profileUpdateSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Убедиться, что падает**

Run: `pnpm --filter @jp/core test profile`
Expected: FAIL — `Failed to resolve import "./profile-schema"`.

- [ ] **Step 3: Реализация**

`packages/core/src/profile/profile-schema.ts`:
```ts
import { z } from 'zod';

export function emptyToUndefined<T extends Record<string, unknown>>(
  input: T,
): { [K in keyof T]: T[K] | undefined } {
  const out = {} as { [K in keyof T]: T[K] | undefined };
  for (const key of Object.keys(input) as (keyof T)[]) {
    const value = input[key];
    out[key] = typeof value === 'string' && value.trim() === '' ? undefined : value;
  }
  return out;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const httpUrl = z.url({ protocol: /^https?$/ });

export const contactsSchema = z.object({
  email: z.email().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9 ()-]{7,20}$/)
    .optional(),
  linkedin: httpUrl.optional(),
  github: httpUrl.optional(),
  portfolio: httpUrl.optional(),
  telegram: z
    .string()
    .regex(/^@?[A-Za-z0-9_]{5,32}$/)
    .optional(),
});

export const profileUpdateSchema = z.object({
  full_name: z.string().trim().min(1).max(120),
  timezone: z.string().refine(isValidTimeZone),
  contacts: contactsSchema,
});

export type Contacts = z.infer<typeof contactsSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
```

`packages/core/src/index.ts` — добавить:
```ts
export * from './profile/profile-schema';
```

- [ ] **Step 4: Тесты проходят**

Run: `pnpm --filter @jp/core test && pnpm --filter @jp/core typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add profile update schema

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Supabase — фундаментальная миграция и RLS-тесты

**Files:**
- Create: `supabase/config.toml` (через `supabase init`), `supabase/migrations/20261001000100_foundation.sql`, `supabase/seed.sql`, `supabase/tests/database/001_foundation.test.sql`, `scripts/supabase-env.sh`

**Interfaces:**
- Produces (таблицы `public`):
  - `roles(id uuid, slug text unique, name jsonb, category text)` — глобальная, read-only для `authenticated`
  - `skills(id uuid, slug text unique, name jsonb, aliases text[])` — глобальная
  - `sources(id text pk, name text, kind text, enabled bool, min_interval_minutes int, paused_until timestamptz)` — глобальная
  - `profiles(id uuid pk → auth.users, full_name, locale, timezone, telegram_chat_id, inbound_email_token, digest_hour, plan, contacts jsonb, follow_up_days int[], ghost_after_days int, onboarded_at, created_at, updated_at)`; `authenticated` может обновлять только `full_name, locale, timezone, digest_hour, contacts, follow_up_days, ghost_after_days, onboarded_at`
  - `board_columns(id, user_id, key, title jsonb, position int, kind)` — 6 колонок по умолчанию: `saved, applied, test_task, interview, offer(won), rejected(lost)`
  - `labels(id, user_id, key, name, color)` — 5 стандартных: `priority, referral, via_recruiter, no_salary, awaiting_interview`
  - триггер `on_auth_user_created` создаёт профиль, колонки и лейблы
- `scripts/supabase-env.sh` пишет `apps/web/.env.local` с `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SITE_URL`.

- [ ] **Step 1: Инициализировать Supabase**

Run: `supabase init` (на вопросы о VS Code/IntelliJ settings ответить `N`).

В `supabase/config.toml` в секции `[auth]` установить:
```toml
site_url = "http://localhost:3000"
additional_redirect_urls = ["http://localhost:3000/**"]
```
В секции `[db.seed]` убедиться, что `enabled = true` и `sql_paths = ["./seed.sql"]`.

- [ ] **Step 2: Написать падающий pgTAP-тест**

`supabase/tests/database/001_foundation.test.sql`:
```sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'a@test.dev', '{"full_name":"Alice"}'),
  ('22222222-2222-2222-2222-222222222222', 'b@test.dev', '{}');

-- trigger side effects (as superuser)
select is((select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice', 'profile created with name from metadata');
select is((select count(*)::int from public.board_columns where user_id = '11111111-1111-1111-1111-111111111111'),
  6, 'six default board columns');
select is((select kind from public.board_columns where user_id = '11111111-1111-1111-1111-111111111111' and key = 'offer'),
  'won', 'offer column is won');
select is((select count(*)::int from public.labels where user_id = '11111111-1111-1111-1111-111111111111'),
  5, 'five default labels');
select isnt((select inbound_email_token from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  (select inbound_email_token from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'inbound tokens are unique');

-- act as Alice
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.profiles), 1, 'sees only own profile');
select is((select count(*)::int from public.board_columns), 6, 'sees only own columns');
select is((select count(*)::int from public.labels), 5, 'sees only own labels');
select ok((select count(*) from public.sources) > 0, 'reads global sources');
select is_empty(
  $$ update public.profiles set full_name = 'hacked' where id = '22222222-2222-2222-2222-222222222222' returning id $$,
  'cannot update another profile');
select lives_ok(
  $$ update public.profiles set full_name = 'Alice B' where id = '11111111-1111-1111-1111-111111111111' $$,
  'can update own name');
select throws_ok(
  $$ update public.profiles set plan = 'pro' where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, 'cannot change plan');
select throws_ok(
  $$ insert into public.board_columns (user_id, key, title, position, kind)
     values ('22222222-2222-2222-2222-222222222222', 'x', '{}', 9, 'active') $$,
  '42501', null, 'cannot insert columns for another user');
select throws_ok(
  $$ insert into public.sources (id, name, kind) values ('evil', 'Evil', 'api') $$,
  '42501', null, 'cannot write global tables');

select * from finish();
rollback;
```

- [ ] **Step 3: Убедиться, что тест падает**

Run: `supabase start && supabase test db`
Expected: FAIL — `relation "public.profiles" does not exist`.

- [ ] **Step 4: Написать миграцию**

`supabase/migrations/20261001000100_foundation.sql`:
```sql
-- ============ helpers ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ============ global reference tables ============
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null,
  category text not null
);

create table public.skills (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name jsonb not null,
  aliases text[] not null default '{}'
);

create table public.sources (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('html', 'api', 'rss', 'email')),
  enabled boolean not null default true,
  min_interval_minutes int not null default 60,
  paused_until timestamptz
);

alter table public.roles enable row level security;
alter table public.skills enable row level security;
alter table public.sources enable row level security;

create policy "roles readable" on public.roles for select to authenticated using (true);
create policy "skills readable" on public.skills for select to authenticated using (true);
create policy "sources readable" on public.sources for select to authenticated using (true);

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  locale text not null default 'uk' check (locale in ('uk', 'ru', 'en')),
  timezone text not null default 'Europe/Kyiv',
  telegram_chat_id bigint,
  inbound_email_token text not null unique
    default substr(md5(gen_random_uuid()::text), 1, 16),
  digest_hour smallint not null default 9 check (digest_hour between 0 and 23),
  plan text not null default 'free',
  contacts jsonb not null default '{}',
  follow_up_days int[] not null default '{5,10}',
  ghost_after_days int not null default 21 check (ghost_after_days between 1 and 90),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "own profile select" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "own profile update" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

revoke insert, update, delete on public.profiles from authenticated, anon;
grant update (full_name, locale, timezone, digest_hour, contacts, follow_up_days,
              ghost_after_days, onboarded_at)
  on public.profiles to authenticated;

-- ============ board columns ============
create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null,
  title jsonb not null,
  position int not null,
  kind text not null default 'active' check (kind in ('active', 'won', 'lost')),
  unique (user_id, key)
);

create index board_columns_user_idx on public.board_columns (user_id, position);
alter table public.board_columns enable row level security;

create policy "own columns" on public.board_columns for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============ labels ============
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text,
  name text,
  color text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  check (key is not null or name is not null),
  unique (user_id, key),
  unique (user_id, name)
);

alter table public.labels enable row level security;

create policy "own labels" on public.labels for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ============ new user bootstrap ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  );

  insert into public.board_columns (user_id, key, title, position, kind) values
    (new.id, 'saved',     '{"uk":"Збережено","ru":"Сохранено","en":"Saved"}', 0, 'active'),
    (new.id, 'applied',   '{"uk":"Відгукнувся","ru":"Откликнулся","en":"Applied"}', 1, 'active'),
    (new.id, 'test_task', '{"uk":"Тестове","ru":"Тестовое","en":"Test task"}', 2, 'active'),
    (new.id, 'interview', '{"uk":"Інтерв''ю","ru":"Интервью","en":"Interview"}', 3, 'active'),
    (new.id, 'offer',     '{"uk":"Офер","ru":"Оффер","en":"Offer"}', 4, 'won'),
    (new.id, 'rejected',  '{"uk":"Відмова","ru":"Отказ","en":"Rejected"}', 5, 'lost');

  insert into public.labels (user_id, key, color) values
    (new.id, 'priority', '#C6F432'),
    (new.id, 'referral', '#7B5CFF'),
    (new.id, 'via_recruiter', '#38BDF8'),
    (new.id, 'no_salary', '#F59E0B'),
    (new.id, 'awaiting_interview', '#F472B6');

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
```

`supabase/seed.sql`:
```sql
insert into public.sources (id, name, kind, min_interval_minutes) values
  ('dou', 'DOU', 'rss', 60),
  ('djinni', 'Djinni', 'html', 120),
  ('workua', 'Work.ua', 'html', 180),
  ('robotaua', 'robota.ua', 'api', 120),
  ('jooble', 'Jooble', 'api', 120),
  ('remoteok', 'RemoteOK', 'api', 120),
  ('remotive', 'Remotive', 'api', 120),
  ('himalayas', 'Himalayas', 'api', 120),
  ('wwr', 'We Work Remotely', 'rss', 120),
  ('hn', 'HN Who''s Hiring', 'api', 1440),
  ('linkedin', 'LinkedIn (email alerts)', 'email', 0)
on conflict (id) do nothing;

insert into public.roles (slug, name, category) values
  ('fullstack-developer', '{"uk":"Full-Stack розробник","ru":"Full-Stack разработчик","en":"Full-Stack Developer"}', 'engineering'),
  ('frontend-developer', '{"uk":"Frontend розробник","ru":"Frontend разработчик","en":"Frontend Developer"}', 'engineering'),
  ('backend-developer', '{"uk":"Backend розробник","ru":"Backend разработчик","en":"Backend Developer"}', 'engineering'),
  ('qa-engineer', '{"uk":"QA інженер","ru":"QA инженер","en":"QA Engineer"}', 'engineering'),
  ('devops-engineer', '{"uk":"DevOps інженер","ru":"DevOps инженер","en":"DevOps Engineer"}', 'engineering'),
  ('product-manager', '{"uk":"Продакт-менеджер","ru":"Продакт-менеджер","en":"Product Manager"}', 'product'),
  ('ui-ux-designer', '{"uk":"UI/UX дизайнер","ru":"UI/UX дизайнер","en":"UI/UX Designer"}', 'design'),
  ('sales-manager', '{"uk":"Менеджер з продажу","ru":"Менеджер по продажам","en":"Sales Manager"}', 'sales'),
  ('marketing-manager', '{"uk":"Маркетолог","ru":"Маркетолог","en":"Marketing Manager"}', 'marketing'),
  ('hr-recruiter', '{"uk":"HR / Рекрутер","ru":"HR / Рекрутер","en":"HR / Recruiter"}', 'hr')
on conflict (slug) do nothing;

insert into public.skills (slug, name, aliases) values
  ('javascript', '{"en":"JavaScript"}', '{js,javascript,es6}'),
  ('typescript', '{"en":"TypeScript"}', '{ts,typescript}'),
  ('react', '{"en":"React"}', '{react,reactjs,react.js}'),
  ('nextjs', '{"en":"Next.js"}', '{next,nextjs,next.js}'),
  ('nodejs', '{"en":"Node.js"}', '{node,nodejs,node.js}'),
  ('nestjs', '{"en":"NestJS"}', '{nest,nestjs,nest.js}'),
  ('postgresql', '{"en":"PostgreSQL"}', '{postgres,postgresql,psql}'),
  ('mongodb', '{"en":"MongoDB"}', '{mongo,mongodb}'),
  ('tailwind', '{"en":"Tailwind CSS"}', '{tailwind,tailwindcss}'),
  ('playwright', '{"en":"Playwright"}', '{playwright}')
on conflict (slug) do nothing;
```

`scripts/supabase-env.sh`:
```bash
#!/usr/bin/env bash
# Writes apps/web/.env.local from the running local Supabase stack.
set -euo pipefail
eval "$(supabase status -o env)"
cat > apps/web/.env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY:-$ANON_KEY}
SUPABASE_SECRET_KEY=${SECRET_KEY:-$SERVICE_ROLE_KEY}
SITE_URL=http://localhost:3000
NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=false
EOF
echo "wrote apps/web/.env.local"
```

Run: `chmod +x scripts/supabase-env.sh`

- [ ] **Step 5: Применить и прогнать тесты**

Run: `supabase db reset && supabase test db`
Expected: `001_foundation.test.sql .. ok`, `All tests successful.` (14 tests).

- [ ] **Step 6: Commit**

```bash
git add supabase scripts/supabase-env.sh
git commit -m "feat(db): add foundation schema with RLS, user bootstrap and seeds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `packages/db` — типы БД и service-клиент

**Files:**
- Create: `packages/db/package.json`, `packages/db/tsconfig.json`, `packages/db/src/index.ts`, `packages/db/src/service-client.ts`, `packages/db/src/database.types.ts` (генерируется)

**Interfaces:**
- Consumes: схема из Task 5.
- Produces:
  - `type Database` (сгенерированный), `type Tables<T>`, `type TablesUpdate<T>` (реэкспорт из сгенерированного файла)
  - `createServiceClient(url: string, secretKey: string): SupabaseClient<Database>` — обходит RLS, только для серверных воркеров и тестов.

- [ ] **Step 1: Создать пакет**

`packages/db/package.json`:
```json
{
  "name": "@jp/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc --noEmit" },
  "dependencies": { "@supabase/supabase-js": "^2.117.2" },
  "devDependencies": { "typescript": "6.0.3" }
}
```

`packages/db/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

- [ ] **Step 2: Сгенерировать типы**

Run: `pnpm install && pnpm db:types`
Expected: файл `packages/db/src/database.types.ts` содержит `profiles:` и `board_columns:`.

Run: `grep -c "board_columns" packages/db/src/database.types.ts`
Expected: число ≥ 1.

- [ ] **Step 3: Клиент и экспорт**

`packages/db/src/service-client.ts`:
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Bypasses RLS. Server-side workers and tests only — never import from client code. */
export function createServiceClient(url: string, secretKey: string): SupabaseClient<Database> {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

`packages/db/src/index.ts`:
```ts
export type { Database, Tables, TablesInsert, TablesUpdate, Json } from './database.types';
export { createServiceClient } from './service-client';
```

- [ ] **Step 4: Проверить типы**

Run: `pnpm --filter @jp/db typecheck`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add packages/db pnpm-lock.yaml
git commit -m "feat(db): add generated types and service client

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `apps/web` — Next.js 16, дизайн-токены, шрифты, темы

**Files:**
- Create (через create-next-app, затем заменить содержимое): `apps/web/*`
- Create: `apps/web/src/app/fonts.ts`, `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/theme-toggle.tsx`
- Modify: `apps/web/package.json`, `apps/web/next.config.ts`, `apps/web/tsconfig.json`, `apps/web/src/app/globals.css`
- Delete: `apps/web/src/app/page.tsx`, `apps/web/src/app/layout.tsx`, `apps/web/public/*.svg` (генерируются шаблоном; заменяются локализованным layout в Task 8)

**Interfaces:**
- Produces:
  - CSS-переменные: `--background --foreground --card --muted --muted-foreground --border --shadow-color --brand --brand-foreground --ai --success --danger --warning --radius`; Tailwind-цвета `bg-background text-foreground bg-card bg-brand text-brand-foreground text-ai border-border text-muted-foreground bg-muted`; шрифты `font-display font-sans font-mono`; классы `.brutal`, `.brutal-press`.
  - `fontVariables: string` из `src/app/fonts.ts`
  - `<Button variant?: 'brand' | 'ghost' | 'outline'>` — серверно-совместимый компонент
  - `<ThemeToggle labels={{ light: string; dark: string; system: string }} />` — клиентский, переключает system → light → dark, `data-testid="theme-toggle"`

- [ ] **Step 1: Сгенерировать приложение**

Run:
```bash
pnpm create next-app@16.3.8 apps/web --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm --yes
```
Expected: создан `apps/web` с `src/app`, `eslint.config.mjs`, Tailwind 4 (`@import "tailwindcss"` в `globals.css`).

Удалить шаблонные файлы:
```bash
rm -f apps/web/src/app/page.tsx apps/web/src/app/layout.tsx apps/web/public/*.svg
rm -rf apps/web/.git
```

- [ ] **Step 2: Зависимости и конфиги**

Run:
```bash
pnpm --filter web add next-intl@^4.14.8 next-themes@^0.4.6 @supabase/ssr@^0.12.7 @supabase/supabase-js@^2.117.2 lucide-react zod@^4.6.5 "@jp/core@workspace:*" "@jp/db@workspace:*"
pnpm --filter web add -D typescript@6.0.3 vitest@^5.0.3 @playwright/test@^1.63.0
```
Если pnpm сообщает о заблокированных build-скриптах — `pnpm approve-builds` и разрешить `sharp`, `esbuild`, `unrs-resolver`.

В `apps/web/package.json` изменить `"name"` на `"@jp/web"` и привести `scripts` к виду:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

`apps/web/tsconfig.json` — в `compilerOptions` добавить `"noUncheckedIndexedAccess": true` (остальное оставить сгенерированным).

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  transpilePackages: ['@jp/core', '@jp/db'],
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 3: Токены и фактура**

`apps/web/src/app/globals.css` (заменить целиком):
```css
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #f4f1e8;
  --foreground: oklch(18% 0 0);
  --card: #fffdf7;
  --muted: oklch(92% 0.01 90);
  --muted-foreground: oklch(42% 0 0);
  --border: oklch(18% 0 0);
  --shadow-color: oklch(18% 0 0);
  --brand: #c6f432;
  --brand-foreground: oklch(16% 0 0);
  --ai: #7b5cff;
  --success: oklch(62% 0.17 150);
  --danger: oklch(64% 0.19 25);
  --warning: oklch(78% 0.16 75);
  --radius: 6px;
  --noise-opacity: 0.06;
}

.dark {
  --background: oklch(16% 0 0);
  --foreground: oklch(96% 0 0);
  --card: oklch(21% 0 0);
  --muted: oklch(26% 0 0);
  --muted-foreground: oklch(72% 0 0);
  --border: oklch(88% 0 0);
  --shadow-color: oklch(88% 0 0);
  --noise-opacity: 0.08;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-ai: var(--ai);
  --color-success: var(--success);
  --color-danger: var(--danger);
  --color-warning: var(--warning);
  --font-display: var(--font-unbounded), system-ui, sans-serif;
  --font-sans: var(--font-onest), system-ui, sans-serif;
  --font-mono: var(--font-jetbrains), ui-monospace, monospace;
  --radius-brutal: var(--radius);
}

@layer base {
  html {
    color-scheme: light;
  }
  html.dark {
    color-scheme: dark;
  }
  body {
    background-color: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans);
    min-height: 100dvh;
  }
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
    opacity: var(--noise-opacity);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
  h1,
  h2,
  h3 {
    font-family: var(--font-display);
    letter-spacing: -0.01em;
  }
}

@layer components {
  .brutal {
    border: 2px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 4px 4px 0 var(--shadow-color);
    background-color: var(--card);
  }
  .brutal-press {
    transition:
      transform 80ms ease-out,
      box-shadow 80ms ease-out;
  }
  .brutal-press:active {
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 var(--shadow-color);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation: none !important;
    transition: none !important;
  }
}
```

`apps/web/src/app/fonts.ts`:
```ts
import { JetBrains_Mono, Onest, Unbounded } from 'next/font/google';

const unbounded = Unbounded({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-unbounded',
  display: 'swap',
});
const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest', display: 'swap' });
const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const fontVariables = `${unbounded.variable} ${onest.variable} ${jetbrains.variable}`;
```

- [ ] **Step 4: Кнопка и переключатель темы**

`apps/web/src/components/ui/button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'brand' | 'outline' | 'ghost';

const variants: Record<Variant, string> = {
  brand: 'brutal brutal-press bg-brand text-brand-foreground',
  outline: 'brutal brutal-press bg-card text-foreground',
  ghost: 'border-2 border-transparent hover:border-border rounded-brutal',
};

export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 font-semibold disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
```

`apps/web/src/components/theme-toggle.tsx`:
```tsx
'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const ORDER = ['system', 'light', 'dark'] as const;
type ThemeName = (typeof ORDER)[number];

export function ThemeToggle({ labels }: { labels: Record<ThemeName, string> }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current: ThemeName = mounted && ORDER.includes(theme as ThemeName) ? (theme as ThemeName) : 'system';
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'system';
  const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : Monitor;

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      data-theme-current={current}
      aria-label={labels[current]}
      title={labels[current]}
      onClick={() => setTheme(next)}
      className="brutal brutal-press grid size-10 place-items-center"
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
```

- [ ] **Step 5: Проверить типы и линтер**

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web lint`
Expected: без ошибок. (Сборка будет проверена в Task 8, когда появится layout.)

- [ ] **Step 6: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): scaffold Next.js 16 app with neo-brutal tokens, fonts and theme toggle

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: i18n (uk/ru/en), локализованный layout, переключатель языка

**Files:**
- Create: `apps/web/src/i18n/routing.ts`, `apps/web/src/i18n/navigation.ts`, `apps/web/src/i18n/request.ts`, `apps/web/messages/uk.json`, `apps/web/messages/ru.json`, `apps/web/messages/en.json`, `apps/web/src/i18n/messages.test.ts`, `apps/web/vitest.config.ts`, `apps/web/src/app/[locale]/layout.tsx`, `apps/web/src/app/[locale]/providers.tsx`, `apps/web/src/app/[locale]/page.tsx`, `apps/web/src/components/locale-switcher.tsx`, `apps/web/src/proxy.ts` (пока только i18n)

**Interfaces:**
- Consumes: `LOCALES`, `DEFAULT_LOCALE`, `findMissingKeys` из `@jp/core`; `fontVariables`; `ThemeToggle`.
- Produces:
  - `routing` (next-intl), `Link`, `redirect`, `usePathname`, `useRouter` из `@/i18n/navigation`
  - `<LocaleSwitcher onChangeAction?: (locale: Locale) => Promise<void> />` — сегменты UK/RU/EN, `data-testid="locale-<code>"`
  - Пространства сообщений: `app`, `nav`, `auth`, `theme`, `locale`, `pages.today|board|analytics|prep`, `comingSoon`, `profile`

- [ ] **Step 1: Падающий тест паритета переводов**

`apps/web/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
```

`apps/web/src/i18n/messages.test.ts`:
```ts
import { findMissingKeys, LOCALES } from '@jp/core';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import ru from '../../messages/ru.json';
import uk from '../../messages/uk.json';

const all = { uk, ru, en } as const;

describe('translation files', () => {
  it.each(LOCALES)('%s has every key that uk has', (locale) => {
    expect(findMissingKeys(uk, all[locale])).toEqual([]);
  });
  it.each(LOCALES)('uk has every key that %s has', (locale) => {
    expect(findMissingKeys(all[locale], uk)).toEqual([]);
  });
});
```

Run: `pnpm --filter @jp/web test`
Expected: FAIL — `Failed to resolve import "../../messages/en.json"`.

- [ ] **Step 2: Файлы переводов**

`apps/web/messages/uk.json`:
```json
{
  "app": { "name": "JOB/PARSER", "tagline": "Свіжі вакансії. Швидкі відгуки. Жодного хаосу." },
  "nav": {
    "today": "Сьогодні",
    "board": "Дошка",
    "analytics": "Аналітика",
    "prep": "Підготовка",
    "profile": "Профіль",
    "soon": "скоро",
    "signOut": "Вийти"
  },
  "auth": {
    "title": "Вхід",
    "subtitle": "Надішлемо посилання для входу на вашу пошту.",
    "email": "Email",
    "send": "Надіслати посилання",
    "sent": "Готово! Перевірте пошту й перейдіть за посиланням.",
    "invalidEmail": "Введіть коректний email.",
    "error": "Не вдалося увійти. Спробуйте ще раз.",
    "or": "або",
    "google": "Увійти через Google"
  },
  "theme": { "light": "Світла тема", "dark": "Темна тема", "system": "Системна тема" },
  "locale": { "label": "Мова" },
  "pages": {
    "today": { "title": "Сьогодні" },
    "board": { "title": "Дошка відгуків" },
    "analytics": { "title": "Аналітика" },
    "prep": { "title": "Підготовка до співбесід" }
  },
  "comingSoon": {
    "badge": "Скоро",
    "today": "Тут щоранку з'являтимуться свіжі вакансії, відібрані під ваш профіль.",
    "board": "Тут буде канбан-дошка ваших відгуків із перетягуванням карток.",
    "analytics": "Тут буде воронка відгуків, причини відмов і поради, що покращити.",
    "prep": "Тут будуть топ-питання для вашої ролі, флеш-картки та live coding."
  },
  "profile": {
    "title": "Профіль",
    "fullName": "Ім'я та прізвище",
    "timezone": "Часовий пояс",
    "contacts": "Контакти для відгуків",
    "email": "Email",
    "phone": "Телефон",
    "linkedin": "LinkedIn",
    "github": "GitHub",
    "portfolio": "Портфоліо",
    "telegram": "Telegram",
    "save": "Зберегти",
    "saved": "Збережено",
    "invalid": "Перевірте поля: {fields}",
    "error": "Не вдалося зберегти. Спробуйте ще раз."
  }
}
```

`apps/web/messages/ru.json`:
```json
{
  "app": { "name": "JOB/PARSER", "tagline": "Свежие вакансии. Быстрые отклики. Никакого хаоса." },
  "nav": {
    "today": "Сегодня",
    "board": "Доска",
    "analytics": "Аналитика",
    "prep": "Подготовка",
    "profile": "Профиль",
    "soon": "скоро",
    "signOut": "Выйти"
  },
  "auth": {
    "title": "Вход",
    "subtitle": "Отправим ссылку для входа на вашу почту.",
    "email": "Email",
    "send": "Отправить ссылку",
    "sent": "Готово! Проверьте почту и перейдите по ссылке.",
    "invalidEmail": "Введите корректный email.",
    "error": "Не удалось войти. Попробуйте ещё раз.",
    "or": "или",
    "google": "Войти через Google"
  },
  "theme": { "light": "Светлая тема", "dark": "Тёмная тема", "system": "Системная тема" },
  "locale": { "label": "Язык" },
  "pages": {
    "today": { "title": "Сегодня" },
    "board": { "title": "Доска откликов" },
    "analytics": { "title": "Аналитика" },
    "prep": { "title": "Подготовка к собеседованиям" }
  },
  "comingSoon": {
    "badge": "Скоро",
    "today": "Здесь каждое утро будут появляться свежие вакансии, отобранные под ваш профиль.",
    "board": "Здесь будет канбан-доска ваших откликов с перетаскиванием карточек.",
    "analytics": "Здесь будет воронка откликов, причины отказов и советы, что улучшить.",
    "prep": "Здесь будут топ-вопросы для вашей роли, флеш-карточки и live coding."
  },
  "profile": {
    "title": "Профиль",
    "fullName": "Имя и фамилия",
    "timezone": "Часовой пояс",
    "contacts": "Контакты для откликов",
    "email": "Email",
    "phone": "Телефон",
    "linkedin": "LinkedIn",
    "github": "GitHub",
    "portfolio": "Портфолио",
    "telegram": "Telegram",
    "save": "Сохранить",
    "saved": "Сохранено",
    "invalid": "Проверьте поля: {fields}",
    "error": "Не удалось сохранить. Попробуйте ещё раз."
  }
}
```

`apps/web/messages/en.json`:
```json
{
  "app": { "name": "JOB/PARSER", "tagline": "Fresh jobs. Fast applications. Zero chaos." },
  "nav": {
    "today": "Today",
    "board": "Board",
    "analytics": "Analytics",
    "prep": "Prep",
    "profile": "Profile",
    "soon": "soon",
    "signOut": "Sign out"
  },
  "auth": {
    "title": "Sign in",
    "subtitle": "We'll email you a sign-in link.",
    "email": "Email",
    "send": "Send link",
    "sent": "Done! Check your inbox and follow the link.",
    "invalidEmail": "Enter a valid email.",
    "error": "Couldn't sign you in. Please try again.",
    "or": "or",
    "google": "Continue with Google"
  },
  "theme": { "light": "Light theme", "dark": "Dark theme", "system": "System theme" },
  "locale": { "label": "Language" },
  "pages": {
    "today": { "title": "Today" },
    "board": { "title": "Application board" },
    "analytics": { "title": "Analytics" },
    "prep": { "title": "Interview prep" }
  },
  "comingSoon": {
    "badge": "Soon",
    "today": "Every morning, fresh jobs matched to your profile will show up here.",
    "board": "A drag-and-drop kanban board of your applications will live here.",
    "analytics": "Your application funnel, rejection reasons and what to improve will live here.",
    "prep": "Top questions for your role, flashcards and live coding will live here."
  },
  "profile": {
    "title": "Profile",
    "fullName": "Full name",
    "timezone": "Time zone",
    "contacts": "Contacts for applications",
    "email": "Email",
    "phone": "Phone",
    "linkedin": "LinkedIn",
    "github": "GitHub",
    "portfolio": "Portfolio",
    "telegram": "Telegram",
    "save": "Save",
    "saved": "Saved",
    "invalid": "Check these fields: {fields}",
    "error": "Couldn't save. Please try again."
  }
}
```

Run: `pnpm --filter @jp/web test`
Expected: PASS (6 tests).

- [ ] **Step 3: Конфигурация next-intl**

`apps/web/src/i18n/routing.ts`:
```ts
import { DEFAULT_LOCALE, LOCALES } from '@jp/core';
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: 'always',
});
```

`apps/web/src/i18n/navigation.ts`:
```ts
import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
```

`apps/web/src/i18n/request.ts`:
```ts
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
```

`apps/web/src/proxy.ts` (временная версия; Task 9 добавит Supabase-сессию):
```ts
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export const proxy = createMiddleware(routing);

export const config = {
  matcher: '/((?!api|auth|_next|_vercel|.*\\..*).*)',
};
```

- [ ] **Step 4: Layout, провайдеры, переключатель**

`apps/web/src/app/[locale]/providers.tsx`:
```tsx
'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  );
}
```

`apps/web/src/app/[locale]/layout.tsx`:
```tsx
import type { Metadata } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { fontVariables } from '../fonts';
import '../globals.css';
import { Providers } from './providers';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });
  return { title: t('name'), description: t('tagline') };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    <html lang={locale} className={fontVariables} suppressHydrationWarning>
      <body className="antialiased">
        <NextIntlClientProvider>
          <Providers>
            <div className="relative z-10">{children}</div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

`apps/web/src/app/[locale]/page.tsx`:
```tsx
import { redirect } from '@/i18n/navigation';

export default async function LocaleIndex({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: '/today', locale });
}
```

`apps/web/src/components/locale-switcher.tsx`:
```tsx
'use client';

import { LOCALES, type Locale } from '@jp/core';
import { useLocale, useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LocaleSwitcher({
  onChangeAction,
}: {
  onChangeAction?: (locale: Locale) => Promise<void>;
}) {
  const t = useTranslations('locale');
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t('label')} className="brutal flex overflow-hidden p-0">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          data-testid={`locale-${locale}`}
          aria-pressed={current === locale}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onChangeAction?.(locale);
              router.replace(pathname, { locale });
            })
          }
          className={`px-2.5 py-1.5 font-mono text-xs uppercase ${
            current === locale ? 'bg-brand text-brand-foreground' : 'hover:bg-muted'
          }`}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Проверить сборку и редиректы**

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web build`
Expected: сборка успешна. (Страница `/today` появится в Task 10; сейчас `/uk` редиректит на 404 — это ожидаемо.)

Run: `pnpm --filter @jp/web dev` и в другом терминале `curl -sI http://localhost:3000/ | grep -i location`
Expected: `location: /uk` (next-intl редирект на локаль по умолчанию). Остановить dev-сервер.

- [ ] **Step 6: Commit**

```bash
git add apps/web
git commit -m "feat(web): add uk/ru/en i18n with locale routing and switcher

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Supabase-клиенты, сессия в proxy, вход (magic link + Google)

**Files:**
- Create: `apps/web/src/env.ts`, `apps/web/src/lib/supabase/server.ts`, `apps/web/src/lib/supabase/browser.ts`, `apps/web/src/lib/supabase/proxy.ts`, `apps/web/src/app/auth/callback/route.ts`, `apps/web/src/app/[locale]/(auth)/login/page.tsx`, `apps/web/src/app/[locale]/(auth)/login/actions.ts`, `apps/web/src/app/[locale]/(auth)/login/login-form.tsx`, `apps/web/src/app/[locale]/(auth)/login/google-button.tsx`
- Modify: `apps/web/src/proxy.ts`

**Interfaces:**
- Consumes: `Database` из `@jp/db`; `safeRedirectPath`, `isLocale`, `DEFAULT_LOCALE` из `@jp/core`; `Button`, `ThemeToggle`, `LocaleSwitcher`.
- Produces:
  - `publicEnv: { NEXT_PUBLIC_SUPABASE_URL: string; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string; NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: boolean }`, `serverEnv(): { SITE_URL: string }` из `@/env`
  - `createClient(): Promise<SupabaseClient<Database>>` из `@/lib/supabase/server` (Server Components, Server Actions, Route Handlers)
  - `createBrowserSupabase(): SupabaseClient<Database>` из `@/lib/supabase/browser`
  - `updateSession(request: NextRequest, response: NextResponse): Promise<NextResponse>` из `@/lib/supabase/proxy`
  - `sendMagicLink(prev: LoginState, formData: FormData): Promise<LoginState>`, `type LoginState = { status: 'idle' | 'sent' | 'invalid' | 'error' }`
  - Маршрут `GET /auth/callback?code=…&next=…`

- [ ] **Step 1: Env и клиенты**

`apps/web/src/env.ts`:
```ts
import { z } from 'zod';

export const publicEnv = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED,
  });

export function serverEnv() {
  return z.object({ SITE_URL: z.url() }).parse({ SITE_URL: process.env.SITE_URL });
}
```

`apps/web/src/lib/supabase/server.ts`:
```ts
import 'server-only';
import type { Database } from '@jp/db';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/env';

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component: cookies are read-only there; proxy.ts refreshes them.
          }
        },
      },
    },
  );
}
```

Run: `pnpm --filter @jp/web add server-only`

`apps/web/src/lib/supabase/browser.ts`:
```ts
import type { Database } from '@jp/db';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnv } from '@/env';

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
```

`apps/web/src/lib/supabase/proxy.ts`:
```ts
import type { Database } from '@jp/db';
import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { publicEnv } from '@/env';

/** Refreshes the Supabase session cookie on the response produced by the i18n proxy. */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );
  await supabase.auth.getClaims();
  return response;
}
```

`apps/web/src/proxy.ts` (заменить целиком):
```ts
import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { updateSession } from './lib/supabase/proxy';

const handleI18n = createMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = handleI18n(request);
  return updateSession(request, response);
}

export const config = {
  matcher: '/((?!api|auth|_next|_vercel|.*\\..*).*)',
};
```

- [ ] **Step 2: Callback-маршрут**

`apps/web/src/app/auth/callback/route.ts`:
```ts
import { DEFAULT_LOCALE, isLocale, safeRedirectPath } from '@jp/core';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (next) return NextResponse.redirect(`${origin}${next}`);
      const { data: profile } = await supabase
        .from('profiles')
        .select('locale')
        .eq('id', data.user.id)
        .single();
      const locale = isLocale(profile?.locale) ? profile.locale : DEFAULT_LOCALE;
      return NextResponse.redirect(`${origin}/${locale}/today`);
    }
  }
  return NextResponse.redirect(`${origin}/${DEFAULT_LOCALE}/login?error=auth`);
}
```

- [ ] **Step 3: Страница входа**

`apps/web/src/app/[locale]/(auth)/login/actions.ts`:
```ts
'use server';

import { getLocale } from 'next-intl/server';
import { z } from 'zod';
import { serverEnv } from '@/env';
import { createClient } from '@/lib/supabase/server';

export type LoginState = { status: 'idle' | 'sent' | 'invalid' | 'error' };

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = z.email().safeParse(formData.get('email'));
  if (!email.success) return { status: 'invalid' };

  const locale = await getLocale();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.data,
    options: {
      emailRedirectTo: `${serverEnv().SITE_URL}/auth/callback?next=/${locale}/today`,
    },
  });
  return { status: error ? 'error' : 'sent' };
}
```

`apps/web/src/app/[locale]/(auth)/login/login-form.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { sendMagicLink, type LoginState } from './actions';

export function LoginForm() {
  const t = useTranslations('auth');
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, {
    status: 'idle',
  });

  if (state.status === 'sent') {
    return (
      <p role="status" className="brutal bg-brand p-4 text-brand-foreground">
        {t('sent')}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-mono text-xs uppercase">{t('email')}</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand"
        />
      </label>
      {state.status === 'invalid' && <p className="text-sm text-danger">{t('invalidEmail')}</p>}
      {state.status === 'error' && <p className="text-sm text-danger">{t('error')}</p>}
      <Button type="submit" variant="brand" disabled={pending}>
        {t('send')}
      </Button>
    </form>
  );
}
```

`apps/web/src/app/[locale]/(auth)/login/google-button.tsx`:
```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export function GoogleButton() {
  const t = useTranslations('auth');
  const locale = useLocale();

  return (
    <Button
      type="button"
      onClick={() =>
        createBrowserSupabase().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${window.location.origin}/auth/callback?next=/${locale}/today` },
        })
      }
    >
      {t('google')}
    </Button>
  );
}
```

`apps/web/src/app/[locale]/(auth)/login/page.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { publicEnv } from '@/env';
import { GoogleButton } from './google-button';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations('auth');
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-12">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-black">{tApp('name')}</span>
        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          <ThemeToggle
            labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }}
          />
        </div>
      </div>
      <section className="brutal flex flex-col gap-5 p-6">
        <div>
          <h1 className="text-3xl font-black">{t('title')}</h1>
          <p className="mt-2 text-muted-foreground">{t('subtitle')}</p>
        </div>
        {error && <p className="text-sm text-danger">{t('error')}</p>}
        <LoginForm />
        {publicEnv.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED && (
          <>
            <div className="text-center font-mono text-xs uppercase text-muted-foreground">
              {t('or')}
            </div>
            <GoogleButton />
          </>
        )}
      </section>
      <p className="text-center text-sm text-muted-foreground">{tApp('tagline')}</p>
    </main>
  );
}
```

- [ ] **Step 4: Проверить вход вручную**

Run: `supabase start && pnpm db:env && pnpm --filter @jp/web dev`
Открыть `http://localhost:3000/uk/login`, ввести `me@test.dev`, нажать «Надіслати посилання».
Expected: сообщение «Готово!». Письмо видно в Mailpit `http://127.0.0.1:54324`; переход по ссылке ведёт на `/uk/today` (пока 404 — страница появится в Task 10). Остановить сервер.

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web lint`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): add Supabase session handling and magic link / Google sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Оболочка приложения: навигация, шапка, защита маршрутов, страницы-заглушки

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/layout.tsx`, `apps/web/src/app/[locale]/(app)/actions.ts`, `apps/web/src/app/[locale]/(app)/today/page.tsx`, `apps/web/src/app/[locale]/(app)/board/page.tsx`, `apps/web/src/app/[locale]/(app)/analytics/page.tsx`, `apps/web/src/app/[locale]/(app)/prep/page.tsx`, `apps/web/src/components/ui/coming-soon.tsx`, `apps/web/src/components/shell/nav-items.ts`, `apps/web/src/components/shell/nav-link.tsx`, `apps/web/src/components/shell/sidebar.tsx`, `apps/web/src/components/shell/bottom-nav.tsx`, `apps/web/src/components/shell/header.tsx`

**Interfaces:**
- Consumes: `createClient`, `redirect` (next-intl), `LocaleSwitcher`, `ThemeToggle`, `Button`, `type Locale`.
- Produces:
  - `NAV_ITEMS: { key: 'today'|'board'|'analytics'|'prep'|'profile'; href: string; icon: LucideIcon; soon?: boolean; mobile: boolean }[]`
  - `setLocaleAction(locale: Locale): Promise<void>` — сохраняет `profiles.locale`
  - `signOutAction(): Promise<void>`
  - `<ComingSoon page="today"|"board"|"analytics"|"prep" />`
  - Защищённая группа `(app)`: без сессии → `/{locale}/login`

- [ ] **Step 1: Серверные действия**

`apps/web/src/app/[locale]/(app)/actions.ts`:
```ts
'use server';

import { isLocale, type Locale } from '@jp/core';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export async function setLocaleAction(locale: Locale) {
  if (!isLocale(locale)) return;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return;
  await supabase.from('profiles').update({ locale }).eq('id', userId);
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: '/login', locale: await getLocale() });
}
```

- [ ] **Step 2: Навигация**

`apps/web/src/components/shell/nav-items.ts`:
```ts
import { BarChart3, Columns3, Flame, GraduationCap, User, type LucideIcon } from 'lucide-react';

export type NavKey = 'today' | 'board' | 'analytics' | 'prep' | 'profile';

export const NAV_ITEMS: {
  key: NavKey;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
  mobile: boolean;
}[] = [
  { key: 'today', href: '/today', icon: Flame, mobile: true },
  { key: 'board', href: '/board', icon: Columns3, mobile: true },
  { key: 'analytics', href: '/analytics', icon: BarChart3, mobile: false },
  { key: 'prep', href: '/prep', icon: GraduationCap, soon: true, mobile: true },
  { key: 'profile', href: '/profile', icon: User, mobile: true },
];
```

`apps/web/src/components/shell/nav-link.tsx`:
```tsx
'use client';

import type { LucideIcon } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';

export function NavLink({
  href,
  icon: Icon,
  label,
  badge,
  compact = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        compact
          ? `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'font-bold' : 'text-muted-foreground'}`
          : `flex items-center gap-3 rounded-brutal border-2 px-3 py-2 font-semibold ${
              active ? 'border-border bg-brand text-brand-foreground shadow-[3px_3px_0_var(--shadow-color)]' : 'border-transparent hover:border-border'
            }`
      }
    >
      <Icon className={compact ? 'size-5' : 'size-4'} aria-hidden />
      <span>{label}</span>
      {badge && !compact && (
        <span className="ml-auto rounded-sm bg-ai px-1.5 font-mono text-[10px] uppercase text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
```

`apps/web/src/components/shell/sidebar.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { NAV_ITEMS } from './nav-items';
import { NavLink } from './nav-link';

export async function Sidebar() {
  const t = await getTranslations('nav');
  return (
    <nav aria-label="Main" className="hidden w-56 shrink-0 flex-col gap-1 md:flex">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.key}
          href={item.href}
          icon={item.icon}
          label={t(item.key)}
          badge={item.soon ? t('soon') : undefined}
        />
      ))}
    </nav>
  );
}
```

`apps/web/src/components/shell/bottom-nav.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';
import { NAV_ITEMS } from './nav-items';
import { NavLink } from './nav-link';

export async function BottomNav() {
  const t = await getTranslations('nav');
  return (
    <nav
      aria-label="Main mobile"
      className="fixed inset-x-0 bottom-0 z-20 flex border-t-2 border-border bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.filter((item) => item.mobile).map((item) => (
        <NavLink key={item.key} href={item.href} icon={item.icon} label={t(item.key)} compact />
      ))}
    </nav>
  );
}
```

`apps/web/src/components/shell/header.tsx`:
```tsx
import { LogOut } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { setLocaleAction, signOutAction } from '@/app/[locale]/(app)/actions';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import { Link } from '@/i18n/navigation';

export async function Header() {
  const tApp = await getTranslations('app');
  const tTheme = await getTranslations('theme');
  const tNav = await getTranslations('nav');

  return (
    <header className="sticky top-0 z-20 border-b-2 border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4">
        <Link href="/today" className="font-display text-lg font-black tracking-tight">
          {tApp('name')}
        </Link>
        <div className="flex items-center gap-2">
          <LocaleSwitcher onChangeAction={setLocaleAction} />
          <ThemeToggle
            labels={{ light: tTheme('light'), dark: tTheme('dark'), system: tTheme('system') }}
          />
          <form action={signOutAction}>
            <button
              type="submit"
              aria-label={tNav('signOut')}
              title={tNav('signOut')}
              data-testid="sign-out"
              className="brutal brutal-press grid size-10 place-items-center"
            >
              <LogOut className="size-5" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Защищённый layout и заглушки**

`apps/web/src/app/[locale]/(app)/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
import { BottomNav } from '@/components/shell/bottom-nav';
import { Header } from '@/components/shell/header';
import { Sidebar } from '@/components/shell/sidebar';
import { redirect } from '@/i18n/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect({ href: '/login', locale });

  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-7xl gap-8 px-4 pt-6 pb-24 md:pb-10">
        <Sidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <BottomNav />
    </>
  );
}
```

`apps/web/src/components/ui/coming-soon.tsx`:
```tsx
import { getTranslations } from 'next-intl/server';

export async function ComingSoon({ page }: { page: 'today' | 'board' | 'analytics' | 'prep' }) {
  const tPages = await getTranslations('pages');
  const t = await getTranslations('comingSoon');

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{tPages(`${page}.title`)}</h1>
      <div className="brutal relative max-w-xl -rotate-1 p-6">
        <span className="absolute -top-3 right-4 rotate-3 rounded-sm border-2 border-border bg-brand px-2 font-mono text-xs uppercase text-brand-foreground">
          {t('badge')}
        </span>
        <p className="text-lg">{t(page)}</p>
      </div>
    </section>
  );
}
```

`apps/web/src/app/[locale]/(app)/today/page.tsx`:
```tsx
import { ComingSoon } from '@/components/ui/coming-soon';

export default function TodayPage() {
  return <ComingSoon page="today" />;
}
```

`apps/web/src/app/[locale]/(app)/board/page.tsx`:
```tsx
import { ComingSoon } from '@/components/ui/coming-soon';

export default function BoardPage() {
  return <ComingSoon page="board" />;
}
```

`apps/web/src/app/[locale]/(app)/analytics/page.tsx`:
```tsx
import { ComingSoon } from '@/components/ui/coming-soon';

export default function AnalyticsPage() {
  return <ComingSoon page="analytics" />;
}
```

`apps/web/src/app/[locale]/(app)/prep/page.tsx`:
```tsx
import { ComingSoon } from '@/components/ui/coming-soon';

export default function PrepPage() {
  return <ComingSoon page="prep" />;
}
```

- [ ] **Step 4: Проверить вручную**

Run: `pnpm --filter @jp/web dev`
- `http://localhost:3000/uk/today` без входа → редирект на `/uk/login`.
- Войти через magic link (Mailpit) → `/uk/today` с заголовком «Сьогодні», боковой панелью (десктоп) и нижней навигацией (ширина < 768px).
- Клик «EN» → `/en/today`, заголовок «Today».
- Переключатель темы меняет класс `dark` на `<html>`.
Остановить сервер.

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web lint && pnpm --filter @jp/web build`
Expected: без ошибок.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add protected app shell with navigation and placeholder pages

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Страница профиля

**Files:**
- Create: `apps/web/src/app/[locale]/(app)/profile/page.tsx`, `apps/web/src/app/[locale]/(app)/profile/actions.ts`, `apps/web/src/app/[locale]/(app)/profile/profile-form.tsx`

**Interfaces:**
- Consumes: `profileUpdateSchema`, `emptyToUndefined`, `type Contacts` из `@jp/core`; `createClient`; `Button`.
- Produces:
  - `updateProfile(prev: ProfileState, formData: FormData): Promise<ProfileState>`, `type ProfileState = { status: 'idle' | 'saved' | 'invalid' | 'error'; fields?: string[] }`
  - Поля формы: `full_name`, `timezone`, `contacts.email|phone|linkedin|github|portfolio|telegram` (атрибут `name` = эти строки), кнопка `data-testid="profile-save"`

- [ ] **Step 1: Серверное действие**

`apps/web/src/app/[locale]/(app)/profile/actions.ts`:
```ts
'use server';

import { emptyToUndefined, profileUpdateSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ProfileState = { status: 'idle' | 'saved' | 'invalid' | 'error'; fields?: string[] };

const CONTACT_KEYS = ['email', 'phone', 'linkedin', 'github', 'portfolio', 'telegram'] as const;

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const raw = {
    full_name: String(formData.get('full_name') ?? ''),
    timezone: String(formData.get('timezone') ?? ''),
    contacts: emptyToUndefined(
      Object.fromEntries(
        CONTACT_KEYS.map((key) => [key, String(formData.get(`contacts.${key}`) ?? '')]),
      ),
    ),
  };

  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'invalid',
      fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))],
    };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return { status: 'error' };

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      timezone: parsed.data.timezone,
      contacts: parsed.data.contacts,
    })
    .eq('id', userId);
  if (error) return { status: 'error' };

  revalidatePath('/[locale]/profile', 'page');
  return { status: 'saved' };
}
```

- [ ] **Step 2: Форма**

`apps/web/src/app/[locale]/(app)/profile/profile-form.tsx`:
```tsx
'use client';

import type { Contacts } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { updateProfile, type ProfileState } from './actions';

type Props = { fullName: string; timezone: string; contacts: Contacts };

const CONTACT_FIELDS = [
  { key: 'email', type: 'email' },
  { key: 'phone', type: 'tel' },
  { key: 'linkedin', type: 'url' },
  { key: 'github', type: 'url' },
  { key: 'portfolio', type: 'url' },
  { key: 'telegram', type: 'text' },
] as const;

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  invalid,
  list,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  invalid: boolean;
  list?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase">{label}</span>
      <input
        name={name}
        type={type}
        list={list}
        defaultValue={defaultValue}
        aria-invalid={invalid}
        className={`brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand ${invalid ? 'border-danger' : ''}`}
      />
    </label>
  );
}

export function ProfileForm({ fullName, timezone, contacts }: Props) {
  const t = useTranslations('profile');
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {
    status: 'idle',
  });
  const invalid = new Set(state.fields ?? []);
  const timeZones = Intl.supportedValuesOf('timeZone');

  return (
    <form action={action} noValidate className="flex max-w-2xl flex-col gap-6">
      <div className="brutal grid gap-4 p-5 md:grid-cols-2">
        <Field name="full_name" label={t('fullName')} defaultValue={fullName} invalid={invalid.has('full_name')} />
        <Field name="timezone" label={t('timezone')} defaultValue={timezone} invalid={invalid.has('timezone')} list="timezones" />
        <datalist id="timezones">
          {timeZones.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
      </div>

      <fieldset className="brutal grid gap-4 p-5 md:grid-cols-2">
        <legend className="px-1 font-display text-lg font-bold">{t('contacts')}</legend>
        {CONTACT_FIELDS.map(({ key, type }) => (
          <Field
            key={key}
            name={`contacts.${key}`}
            type={type}
            label={t(key)}
            defaultValue={contacts[key]}
            invalid={invalid.has(`contacts.${key}`)}
          />
        ))}
      </fieldset>

      <div className="flex items-center gap-4">
        <Button type="submit" variant="brand" disabled={pending} data-testid="profile-save">
          {t('save')}
        </Button>
        <p role="status" className="text-sm">
          {state.status === 'saved' && <span className="text-success">{t('saved')}</span>}
          {state.status === 'invalid' && (
            <span className="text-danger">{t('invalid', { fields: [...invalid].join(', ') })}</span>
          )}
          {state.status === 'error' && <span className="text-danger">{t('error')}</span>}
        </p>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Страница**

`apps/web/src/app/[locale]/(app)/profile/page.tsx`:
```tsx
import { contactsSchema } from '@jp/core';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const t = await getTranslations('profile');
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, timezone, contacts')
    .eq('id', claims?.claims.sub ?? '')
    .single();

  const contacts = contactsSchema.safeParse(profile?.contacts ?? {});

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      <ProfileForm
        fullName={profile?.full_name ?? ''}
        timezone={profile?.timezone ?? 'Europe/Kyiv'}
        contacts={contacts.success ? contacts.data : {}}
      />
    </section>
  );
}
```

- [ ] **Step 4: Проверить**

Run: `pnpm --filter @jp/web typecheck && pnpm --filter @jp/web lint && pnpm --filter @jp/web build`
Expected: без ошибок.

Вручную (`pnpm --filter @jp/web dev`, войти): `/uk/profile` → ввести имя, GitHub `https://github.com/x` → «Зберегти» → «Збережено»; ввести GitHub `abc` → «Перевірте поля: contacts.github».

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat(web): add profile page with contacts form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: E2E-тесты (Playwright)

**Files:**
- Create: `apps/web/playwright.config.ts`, `apps/web/e2e/helpers/auth.ts`, `apps/web/e2e/auth.spec.ts`, `apps/web/e2e/shell.spec.ts`, `apps/web/e2e/profile.spec.ts`

**Interfaces:**
- Consumes: запущенный локальный Supabase, `apps/web/.env.local` (Task 5 `pnpm db:env`), всё UI из Tasks 8–11.
- Produces: `loginAs(context: BrowserContext, email: string): Promise<void>` — создаёт подтверждённого пользователя через admin API и кладёт сессионные cookie в контекст браузера.

- [ ] **Step 1: Конфиг и хелпер**

Run: `pnpm --filter @jp/web add -D dotenv && pnpm --filter @jp/web exec playwright install chromium`

`apps/web/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: 'http://localhost:3000/uk/login',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
```

`apps/web/e2e/helpers/auth.ts`:
```ts
import type { BrowserContext } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const PASSWORD = 'E2e-password-123!';

export async function loginAs(context: BrowserContext, email: string) {
  const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createError && !/already/i.test(createError.message)) throw createError;

  const jar = new Map<string, string>();
  const supabase = createServerClient(URL, PUBLISHABLE, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value } of cookies) {
          if (value) jar.set(name, value);
          else jar.delete(name);
        }
      },
    },
  });
  const { error } = await supabase.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw error;
  if (jar.size === 0) throw new Error('Supabase did not set any session cookies');

  await context.addCookies(
    [...jar].map(([name, value]) => ({
      name,
      value,
      domain: 'localhost',
      path: '/',
      sameSite: 'Lax' as const,
    })),
  );
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.test`;
}
```

- [ ] **Step 2: Тесты**

`apps/web/e2e/auth.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('root redirects to default locale login when signed out', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/uk\/login$/);
  await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible();
});

test('protected page redirects to login', async ({ page }) => {
  await page.goto('/en/board');
  await expect(page).toHaveURL(/\/en\/login$/);
});

test('magic link form confirms sending', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByLabel('Email').fill('someone@e2e.test');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByRole('status')).toContainText('Check your inbox');
});
```

`apps/web/e2e/shell.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test.beforeEach(async ({ context }) => {
  await loginAs(context, uniqueEmail('shell'));
});

test('shows today page with navigation in Ukrainian', async ({ page }) => {
  await page.goto('/uk/today');
  await expect(page.getByRole('heading', { name: 'Сьогодні' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Дошка' }).filter({ visible: true }).first()).toBeVisible();
});

test('switches language and keeps the page', async ({ page }) => {
  await page.goto('/uk/today');
  await page.getByTestId('locale-ru').click();
  await expect(page).toHaveURL(/\/ru\/today$/);
  await expect(page.getByRole('heading', { name: 'Сегодня' })).toBeVisible();
  await page.getByTestId('locale-en').click();
  await expect(page).toHaveURL(/\/en\/today$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('theme toggle cycles system → light → dark', async ({ page }) => {
  await page.goto('/en/today');
  const toggle = page.getByTestId('theme-toggle');
  await expect(toggle).toHaveAttribute('data-theme-current', 'system');
  await toggle.click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.screenshot({ path: `test-results/today-dark-${test.info().project.name}.png` });
});

test('navigates to board and signs out', async ({ page }) => {
  await page.goto('/en/today');
  await page.getByRole('link', { name: 'Board' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Application board' })).toBeVisible();
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/en\/login$/);
});
```

`apps/web/e2e/profile.spec.ts`:
```ts
import { expect, test } from '@playwright/test';
import { loginAs, uniqueEmail } from './helpers/auth';

test.beforeEach(async ({ context }) => {
  await loginAs(context, uniqueEmail('profile'));
});

test('saves profile and keeps values after reload', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('GitHub').fill('https://github.com/test-user');
  await page.getByTestId('profile-save').click();
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Test User');
  await expect(page.getByLabel('GitHub')).toHaveValue('https://github.com/test-user');
});

test('shows invalid fields', async ({ page }) => {
  await page.goto('/en/profile');
  await page.getByLabel('Full name').fill('Test User');
  await page.getByLabel('GitHub').fill('not-a-url');
  await page.getByTestId('profile-save').click();
  await expect(page.getByRole('status')).toContainText('contacts.github');
});
```

- [ ] **Step 3: Прогнать**

Run: `supabase start && pnpm db:env && pnpm --filter @jp/web test:e2e`
Expected: все тесты PASS в проектах `desktop` и `mobile`. Если падает только `magic link form confirms sending` из-за rate-limit писем Supabase — в `supabase/config.toml` `[auth.rate_limit] email_sent = 100`, затем `supabase stop && supabase start`.

- [ ] **Step 4: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "test(web): add Playwright e2e for auth, shell, i18n, themes and profile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: CI (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: корневые скрипты (Task 1), `scripts/supabase-env.sh` (Task 5), E2E (Task 12).
- Produces: три job-а — `checks` (lint, typecheck, unit), `database` (pgTAP), `e2e`.

- [ ] **Step 1: Workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test

  database:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
      - run: supabase test db

  e2e:
    runs-on: ubuntu-latest
    needs: checks
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version-file: .nvmrc, cache: pnpm }
      - uses: supabase/setup-cli@v1
        with: { version: latest }
      - run: pnpm install --frozen-lockfile
      - run: supabase start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor
      - run: bash scripts/supabase-env.sh
      - run: pnpm --filter @jp/web exec playwright install --with-deps chromium
      - run: pnpm --filter @jp/web test:e2e
        env: { CI: 'true' }
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: |
            apps/web/playwright-report
            apps/web/test-results
```

- [ ] **Step 2: Проверить локально всё, что запускает CI**

Run: `pnpm lint && pnpm typecheck && pnpm test && supabase test db`
Expected: всё зелёное.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint, typecheck, unit, database and e2e workflow

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Критерии готовности плана 1

- [ ] `pnpm lint && pnpm typecheck && pnpm test` — зелёные.
- [ ] `supabase test db` — 14 RLS/bootstrap тестов зелёные.
- [ ] `pnpm --filter @jp/web test:e2e` — зелёные на desktop и mobile.
- [ ] Вручную: вход по magic link, переключение uk/ru/en и тем, профиль сохраняется, на мобильной ширине — нижняя навигация.
- [ ] Ревью пользователя → переход к написанию плана 2 (конвейер вакансий).
