'use server';

import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { fetchJobPreview } from '@/lib/job-preview';
import { createClient } from '@/lib/supabase/server';
import { cleanTopic, type SavedLink } from './topics';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function httpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.toString().length <= 1000 ? u : null;
  } catch {
    return null;
  }
}

/** The page's own title (og:title or <title>), fetched through the guarded fetcher; null when it cannot be read. */
export async function previewLinkTitle(raw: string): Promise<string | null> {
  if (!(await getUserId())) return null;
  const url = httpUrl(raw);
  if (!url) return null;
  const preview = await fetchJobPreview(url.toString()).catch(() => null);
  return preview?.title?.trim().slice(0, 300) || null;
}

export async function saveLink(raw: { url: string; title: string; topic: string; note: string }): Promise<{ ok: true; link: SavedLink } | { ok: false; error: 'invalid' | 'duplicate' | 'failed' }> {
  const userId = await getUserId();
  const url = httpUrl(raw.url);
  if (!userId || !url) return { ok: false, error: 'invalid' };
  const title = raw.title.trim().slice(0, 300) || url.hostname;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_links')
    .insert({ user_id: userId, url: url.toString(), title, topic: cleanTopic(raw.topic), note: raw.note.trim().slice(0, 1000) || null })
    .select('id, url, title, topic, note, created_at')
    .single();
  if (error) return { ok: false, error: error.code === '23505' ? 'duplicate' : 'failed' };
  revalidatePath('/[locale]/library', 'page');
  return { ok: true, link: { id: data.id, url: data.url, title: data.title, topic: data.topic, note: data.note, createdAt: data.created_at } };
}

export async function updateLink(id: string, patch: { title: string; topic: string; note: string }): Promise<boolean> {
  if (!(await getUserId()) || !UUID.test(id)) return false;
  const title = patch.title.trim().slice(0, 300);
  if (!title) return false;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_links')
    .update({ title, topic: cleanTopic(patch.topic), note: patch.note.trim().slice(0, 1000) || null })
    .eq('id', id)
    .select('id');
  return !error && (data?.length ?? 0) > 0;
}

export async function deleteLink(id: string): Promise<boolean> {
  if (!(await getUserId()) || !UUID.test(id)) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from('saved_links').delete().eq('id', id).select('id');
  return !error && (data?.length ?? 0) > 0;
}
