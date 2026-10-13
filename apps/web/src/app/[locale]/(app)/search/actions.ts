'use server';

import { MAX_KEYWORDS, parseList, searchProfileInputSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

export type SearchFormState = { status: 'idle' | 'saved' | 'invalid' | 'error'; fields?: string[] };

export async function saveSearchProfile(_prev: SearchFormState, formData: FormData): Promise<SearchFormState> {
  const salary = String(formData.get('salaryMinUsd') ?? '').trim();
  const parsed = searchProfileInputSchema.safeParse({
    id: String(formData.get('id') ?? '') || undefined,
    name: String(formData.get('name') ?? ''),
    keywords: parseList(String(formData.get('keywords') ?? ''), MAX_KEYWORDS),
    targetRoles: formData.getAll('targetRoles').map(String),
    skills: parseList(String(formData.get('skills') ?? ''), 100),
    excludeKeywords: parseList(String(formData.get('excludeKeywords') ?? '')),
    seniority: formData.getAll('seniority').map(String),
    locations: parseList(String(formData.get('locations') ?? ''), 10),
    remoteType: String(formData.get('remoteType') ?? 'any'),
    sources: formData.getAll('sources').map(String),
    salaryMinUsd: salary === '' ? null : Number(salary),
    isActive: formData.get('isActive') === 'on',
  });
  if (!parsed.success) {
    return { status: 'invalid', fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))] };
  }

  const userId = await getUserId();
  if (!userId) return { status: 'error' };
  const p = parsed.data;
  const row = {
    user_id: userId,
    name: p.name,
    keywords: p.keywords,
    target_roles: p.targetRoles,
    skills: p.skills,
    exclude_keywords: p.excludeKeywords,
    seniority: p.seniority,
    locations: p.locations,
    remote_type: p.remoteType,
    sources: p.sources,
    salary_min_usd: p.salaryMinUsd,
    is_active: p.isActive,
  };

  const supabase = await createClient();
  // One search per user: a "new" form submitted while one exists (another tab) updates it instead.
  const { data: existing } = p.id ? { data: null } : await supabase.from('search_profiles').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const id = p.id ?? existing?.id;
  const { data, error } = id
    ? await supabase.from('search_profiles').update(row).eq('id', id).select('id').single()
    : await supabase.from('search_profiles').insert(row).select('id').single();
  if (error) return { status: 'error' };
  // Left over from when several searches were allowed: only the one just saved stays.
  const { error: extraError } = await supabase.from('search_profiles').delete().eq('user_id', userId).neq('id', data.id);
  if (extraError) console.error('saveSearchProfile: could not drop older searches', extraError.code ?? 'unknown');

  await requestProfileSync(data.id);
  revalidatePath('/[locale]/search', 'page');
  // The first save swaps the blank form for the stored one, so a resubmit cannot create a duplicate.
  if (!p.id) redirect({ href: '/search', locale: await getLocale() });
  return { status: 'saved' };
}

export async function deleteSearchProfile(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  if (!id || !(await getUserId())) return;
  const supabase = await createClient();
  await supabase.from('search_profiles').delete().eq('id', id);
  revalidatePath('/[locale]/search', 'page');
}
