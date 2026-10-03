'use server';

import { defaultSources, parseList, searchProfileInputSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

export type SearchFormState = { status: 'idle' | 'saved' | 'invalid' | 'error'; fields?: string[] };

export async function saveSearchProfile(_prev: SearchFormState, formData: FormData): Promise<SearchFormState> {
  const salary = String(formData.get('salaryMinUsd') ?? '').trim();
  const remoteType = String(formData.get('remoteType') ?? 'any');
  const parsed = searchProfileInputSchema.safeParse({
    id: String(formData.get('id') ?? '') || undefined,
    name: String(formData.get('name') ?? ''),
    keywords: parseList(String(formData.get('keywords') ?? ''), 5),
    skills: parseList(String(formData.get('skills') ?? '')),
    excludeKeywords: parseList(String(formData.get('excludeKeywords') ?? '')),
    seniority: formData.getAll('seniority').map(String),
    locations: parseList(String(formData.get('locations') ?? ''), 10),
    remoteType,
    // TODO(Task 7): replace with real form field
    sources: defaultSources((['any', 'remote', 'hybrid', 'office'] as const).find((r) => r === remoteType) ?? 'any'),
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
    skills: p.skills,
    exclude_keywords: p.excludeKeywords,
    seniority: p.seniority,
    locations: p.locations,
    remote_type: p.remoteType,
    salary_min_usd: p.salaryMinUsd,
    is_active: p.isActive,
  };

  const supabase = await createClient();
  const { data, error } = p.id
    ? await supabase.from('search_profiles').update(row).eq('id', p.id).select('id').single()
    : await supabase.from('search_profiles').insert(row).select('id').single();
  if (error) return { status: 'error' };

  await requestProfileSync(data.id);
  revalidatePath('/[locale]/search', 'page');
  // A new profile leaves the ?new=1 form behind, so a resubmit or reload cannot create a duplicate.
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
