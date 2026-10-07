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
