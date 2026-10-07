'use server';

import { parseCv, searchProfileFromCv } from '@jp/ai';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { consumePrivateAi, getLlm, privateAiAvailable } from '@/lib/ai';
import { getUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

export type CvState = { status: 'idle' | 'parsed' | 'stored' | 'invalid' | 'error'; message?: 'not_pdf' | 'too_big' | 'ai_unavailable' | 'ai_limit' | 'parse_failed' };

const MAX_BYTES = 5 * 1024 * 1024;

export async function uploadCv(_prev: CvState, formData: FormData): Promise<CvState> {
  const userId = await getUserId();
  const file = formData.get('cv');
  if (!userId) return { status: 'error' };
  if (!(file instanceof File) || file.size === 0) return { status: 'invalid', message: 'not_pdf' };
  if (file.size > MAX_BYTES) return { status: 'invalid', message: 'too_big' };
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return { status: 'invalid', message: 'not_pdf' };

  const supabase = await createClient();
  const path = `${userId}/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await supabase.storage.from('resumes').upload(path, bytes, { contentType: 'application/pdf' });
  if (uploadError) return { status: 'error' };

  const previous = await loadPrimaryCv(supabase);
  if (previous) {
    const { error: flipError } = await supabase.from('resumes').update({ is_primary: false }).eq('id', previous.id);
    if (flipError) {
      console.error('cv: could not demote previous CV', flipError.message);
      await supabase.storage.from('resumes').remove([path]);
      return { status: 'error' };
    }
  }
  const fileName = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 200) || 'cv.pdf';
  const { data: row, error } = await supabase.from('resumes').insert({ user_id: userId, storage_path: path, file_name: fileName, is_primary: true }).select('id').single();
  if (error || !row) {
    await supabase.storage.from('resumes').remove([path]);
    if (previous) await supabase.from('resumes').update({ is_primary: true }).eq('id', previous.id);
    return { status: 'error' };
  }
  if (previous) {
    // Cleanup only after the new CV is safely stored; failures must not fail the upload.
    const { error: removeError } = await supabase.storage.from('resumes').remove([previous.path]);
    if (removeError) console.error('cv: could not remove previous file', removeError.message);
    const { error: deleteError } = await supabase.from('resumes').delete().eq('id', previous.id);
    if (deleteError) console.error('cv: could not delete previous row', deleteError.message);
  }
  revalidatePath('/[locale]/profile', 'page');

  if (!privateAiAvailable()) {
    const { error: flagError } = await supabase.from('resumes').update({ parse_error: 'ai_unavailable' }).eq('id', row.id);
    if (flagError) console.error('cv: could not flag ai_unavailable', flagError.code ?? 'unknown');
    return { status: 'stored', message: 'ai_unavailable' };
  }
  if (!(await consumePrivateAi(supabase))) {
    const { error: flagError } = await supabase.from('resumes').update({ parse_error: 'ai_limit' }).eq('id', row.id);
    if (flagError) console.error('cv: could not flag ai_limit', flagError.code ?? 'unknown');
    return { status: 'stored', message: 'ai_limit' };
  }
  try {
    const parsed = await parseCv(getLlm(), { pdfBase64: bytes.toString('base64') });
    const { error: parsedError } = await supabase.from('resumes').update({ parsed, parse_error: null }).eq('id', row.id);
    if (parsedError) {
      console.error('cv: could not store parsed CV', parsedError.code ?? 'unknown');
      return { status: 'stored', message: 'parse_failed' };
    }
    return { status: 'parsed' };
  } catch (err) {
    console.error('parseCv failed', err instanceof Error ? err.name : 'unknown');
    const { error: flagError } = await supabase.from('resumes').update({ parse_error: 'parse_failed' }).eq('id', row.id);
    if (flagError) console.error('cv: could not flag parse_failed', flagError.code ?? 'unknown');
    return { status: 'stored', message: 'parse_failed' };
  }
}

export async function createSearchProfileFromCv(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const supabase = await createClient();
  const cv = await loadPrimaryCv(supabase);
  if (!cv?.parsed) return;
  const p = searchProfileFromCv(cv.parsed);
  const { data, error } = await supabase
    .from('search_profiles')
    .insert({ user_id: userId, name: p.name, keywords: p.keywords, skills: p.skills, seniority: p.seniority, locations: p.locations, remote_type: p.remoteType })
    .select('id')
    .single();
  if (error || !data) return;
  await requestProfileSync(data.id);
  revalidatePath('/[locale]/search', 'page');
  redirect({ href: '/search', locale: await getLocale() });
}

export async function fillContactsFromCv(): Promise<boolean> {
  const userId = await getUserId();
  if (!userId) return false;
  const supabase = await createClient();
  const cv = await loadPrimaryCv(supabase);
  if (!cv?.parsed) return false;
  const { data: profile } = await supabase.from('profiles').select('contacts, full_name').eq('id', userId).single();
  const current = (profile?.contacts ?? {}) as Record<string, string | undefined>;
  const next: Record<string, string> = Object.fromEntries(Object.entries(current).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1] !== ''));
  for (const [k, v] of Object.entries(cv.parsed.contacts)) if (v && !next[k]) next[k] = v;
  const { error } = await supabase
    .from('profiles')
    .update({ contacts: next, ...(!profile?.full_name && cv.parsed.fullName?.trim() ? { full_name: cv.parsed.fullName.trim() } : {}) })
    .eq('id', userId);
  revalidatePath('/[locale]/profile', 'page');
  return !error;
}
