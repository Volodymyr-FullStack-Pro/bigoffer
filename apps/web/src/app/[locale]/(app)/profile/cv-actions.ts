'use server';

import { parseCv } from '@jp/ai';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { consumePrivateAi, getLlm, privateAiAvailable } from '@/lib/ai';
import { type AiFailure, classifyAiFailure, describeAiFailure } from '@/lib/ai-failure';
import { getUserId } from '@/lib/auth';
import { loadPrimaryCv } from '@/lib/cv';
import { createClient } from '@/lib/supabase/server';
import { dropSearch, replaceSearchFromCv } from '@/lib/search-from-cv';

export type CvState = { status: 'idle' | 'parsed' | 'stored' | 'invalid' | 'error'; message?: 'not_pdf' | 'too_big' | 'ai_limit' | AiFailure };

const MAX_BYTES = 5 * 1024 * 1024;

const PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/i;

// The browser uploads the PDF straight to Storage (Vercel caps request bodies at 4.5 MB); this only verifies and registers it.
export async function registerCv(path: string, originalName: string): Promise<CvState> {
  const userId = await getUserId();
  if (!userId) return { status: 'error' };
  if (typeof path !== 'string' || !PATH.test(path) || !path.startsWith(`${userId}/`)) return { status: 'invalid', message: 'not_pdf' };
  const supabase = await createClient();
  // An already-registered object must never be touched (the reject paths below delete it).
  const { data: existing } = await supabase.from('resumes').select('id').eq('storage_path', path).maybeSingle();
  if (existing) return { status: 'error' };
  const { data: blob, error: downloadError } = await supabase.storage.from('resumes').download(path);
  if (downloadError || !blob) return { status: 'error' };
  const bytes = Buffer.from(await blob.arrayBuffer());
  const reject = async (message: 'not_pdf' | 'too_big'): Promise<CvState> => {
    await supabase.storage.from('resumes').remove([path]);
    return { status: 'invalid', message };
  };
  if (bytes.length > MAX_BYTES) return reject('too_big');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return reject('not_pdf');

  const previous = await loadPrimaryCv(supabase);
  if (previous) {
    const { error: flipError } = await supabase.from('resumes').update({ is_primary: false }).eq('id', previous.id);
    if (flipError) {
      console.error('cv: could not demote previous CV', flipError.message);
      await supabase.storage.from('resumes').remove([path]);
      return { status: 'error' };
    }
  }
  const fileName = String(originalName).replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 200) || 'cv.pdf';
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

  const result = await parseAndStore(supabase, row.id, bytes);
  // A new CV means a new search: the old one (and what it found) goes.
  if (result.status === 'parsed') await searchFollowsCv(supabase, userId, 'replace');
  else if (previous) await dropSearch(supabase, userId);
  return result;
}

/** Builds the search from the primary CV: 'replace' always, 'missing' only when the user has none. */
async function searchFollowsCv(supabase: Supabase, userId: string, mode: 'replace' | 'missing'): Promise<void> {
  if (mode === 'missing') {
    const { count } = await supabase.from('search_profiles').select('id', { count: 'exact', head: true });
    if ((count ?? 0) > 0) return;
  }
  const cv = await loadPrimaryCv(supabase);
  if (cv?.parsed) await replaceSearchFromCv(supabase, userId, cv.parsed);
  revalidatePath('/[locale]/search', 'page');
  revalidatePath('/[locale]/today', 'page');
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Runs the AI CV parse for a stored resume row and records the outcome on it. */
async function parseAndStore(supabase: Supabase, rowId: string, bytes: Buffer): Promise<CvState> {
  if (!privateAiAvailable()) {
    const { error: flagError } = await supabase.from('resumes').update({ parse_error: 'ai_unavailable' }).eq('id', rowId);
    if (flagError) console.error('cv: could not flag ai_unavailable', flagError.code ?? 'unknown');
    return { status: 'stored', message: 'ai_unavailable' };
  }
  if (!(await consumePrivateAi(supabase))) {
    const { error: flagError } = await supabase.from('resumes').update({ parse_error: 'ai_limit' }).eq('id', rowId);
    if (flagError) console.error('cv: could not flag ai_limit', flagError.code ?? 'unknown');
    return { status: 'stored', message: 'ai_limit' };
  }
  try {
    const parsed = await parseCv(getLlm(), { pdfBase64: bytes.toString('base64') });
    const { error: parsedError } = await supabase.from('resumes').update({ parsed, parse_error: null, parse_error_detail: null }).eq('id', rowId);
    if (parsedError) {
      console.error('cv: could not store parsed CV', parsedError.code ?? 'unknown');
      return { status: 'stored', message: 'parse_failed' };
    }
    return { status: 'parsed' };
  } catch (err) {
    // Sanitized: name, HTTP status and a truncated provider message, never the CV text or keys.
    const detail = describeAiFailure(err);
    console.error('parseCv failed', detail);
    const failure = classifyAiFailure(err);
    // The detail is kept on the row (sanitized, no CV text or keys): Hobby runtime logs vanish within the hour.
    const { error: flagError } = await supabase.from('resumes').update({ parse_error: failure, parse_error_detail: detail.slice(0, 400) }).eq('id', rowId);
    if (flagError) console.error(`cv: could not flag ${failure}`, flagError.code ?? 'unknown');
    return { status: 'stored', message: failure };
  }
}

/** Re-runs the AI parse of the primary CV (e.g. after a provider hiccup) without uploading it again. */
export async function retryCvParse(): Promise<CvState> {
  const userId = await getUserId();
  if (!userId) return { status: 'error' };
  const supabase = await createClient();
  const cv = await loadPrimaryCv(supabase);
  if (!cv) return { status: 'error' };
  const { data: blob, error } = await supabase.storage.from('resumes').download(cv.path);
  if (error || !blob) return { status: 'error' };
  const result = await parseAndStore(supabase, cv.id, Buffer.from(await blob.arrayBuffer()));
  // A re-read keeps the user's edits to an existing search; it only fills in a missing one.
  if (result.status === 'parsed') await searchFollowsCv(supabase, userId, 'missing');
  revalidatePath('/[locale]/profile', 'page');
  return result;
}

export async function deleteCv(): Promise<{ ok: boolean }> {
  const userId = await getUserId();
  if (!userId) return { ok: false };
  const supabase = await createClient();
  const cv = await loadPrimaryCv(supabase);
  if (!cv) return { ok: true };
  const { error: removeError } = await supabase.storage.from('resumes').remove([cv.path]);
  if (removeError) {
    console.error('cv: could not remove file', removeError.message);
    return { ok: false };
  }
  const { error: deleteError } = await supabase.from('resumes').delete().eq('id', cv.id);
  if (deleteError) {
    console.error('cv: could not delete row', deleteError.code ?? 'unknown');
    return { ok: false };
  }
  await dropSearch(supabase, userId);
  revalidatePath('/[locale]/profile', 'page');
  revalidatePath('/[locale]/search', 'page');
  return { ok: true };
}

/** "Rebuild my search from the CV": replaces the search, keeping excluded words, boards and salary. */
export async function createSearchProfileFromCv(): Promise<void> {
  const userId = await getUserId();
  if (!userId) return;
  const supabase = await createClient();
  await searchFollowsCv(supabase, userId, 'replace');
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
