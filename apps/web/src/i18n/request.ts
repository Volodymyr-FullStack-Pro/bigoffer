import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { routing } from './routing';

const DEFAULT_TIME_ZONE = 'Europe/Kyiv';

function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The signed-in user's profile time zone (one cheap select), else the product default. */
async function userTimeZone(): Promise<string> {
  const supabase = await createClient();
  try {
    const { data } = await supabase.auth.getClaims();
    const userId = data?.claims.sub;
    if (!userId) return DEFAULT_TIME_ZONE;
    const { data: profile } = await supabase.from('profiles').select('timezone').eq('id', userId).maybeSingle();
    return validTimeZone(profile?.timezone) ? profile.timezone : DEFAULT_TIME_ZONE;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    timeZone: await userTimeZone(),
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
