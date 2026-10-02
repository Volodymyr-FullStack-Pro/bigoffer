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
