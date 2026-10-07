import type { BrowserContext } from '@playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUBLISHABLE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY!;
const PASSWORD = 'E2e-password-123!';

const adminClient = () => createClient(URL, SECRET, { auth: { persistSession: false } });

export async function ensureUser(email: string) {
  const { error } = await adminClient().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
}

/** The /auth/confirm URL a magic-link email for `email` would open, carrying `next`. */
export async function magicLinkConfirmPath(email: string, next: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  if (error) throw error;
  return `/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`;
}

export async function loginAs(context: BrowserContext, email: string) {
  await ensureUser(email);

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
