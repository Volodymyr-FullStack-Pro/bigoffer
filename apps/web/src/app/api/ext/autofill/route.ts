import { NextResponse } from 'next/server';
import { z } from 'zod';
import { autofill } from '@/lib/autofill';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const body = z.object({ fields: z.array(z.object({ label: z.string().max(300), type: z.string().max(20) })).max(80) });

/**
 * The browser extension's "Fill this form": field labels in, the user's values out. Authenticated by the BigOffer
 * session cookie the extension's request carries (it has host permission for this site); nothing is stored.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: 'signed_out' }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const supabase = await createClient();
  const [{ data: profile }, { data: bank }] = await Promise.all([
    supabase.from('profiles').select('full_name, contacts').eq('id', userId).single(),
    supabase.from('answer_bank').select('key, answer'),
  ]);
  const contacts = Object.fromEntries(
    Object.entries((profile?.contacts ?? {}) as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].trim() !== ''),
  );
  const values = autofill(parsed.data.fields, {
    fullName: profile?.full_name?.trim() || null,
    contacts,
    bank: (bank ?? []).map((b) => ({ key: b.key, answer: (b.answer ?? {}) as Record<string, string> })),
  });
  return NextResponse.json({ values }, { headers: { 'Cache-Control': 'no-store' } });
}
