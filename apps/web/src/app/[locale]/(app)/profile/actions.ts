'use server';

import { emptyToUndefined, profileUpdateSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { requestProfileSync } from '@/lib/trigger';

export type ProfileValues = { full_name: string; timezone: string; country: string; contacts: Record<string, string> };
export type ProfileState = {
  status: 'idle' | 'saved' | 'invalid' | 'error';
  fields?: string[];
  values?: ProfileValues;
};

const CONTACT_KEYS = ['email', 'phone', 'linkedin', 'github', 'portfolio', 'telegram'] as const;

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const values: ProfileValues = {
    full_name: String(formData.get('full_name') ?? ''),
    timezone: String(formData.get('timezone') ?? ''),
    country: String(formData.get('country') ?? ''),
    contacts: Object.fromEntries(
      CONTACT_KEYS.map((key) => [key, String(formData.get(`contacts.${key}`) ?? '')]),
    ),
  };
  const raw = {
    full_name: values.full_name,
    timezone: values.timezone,
    contacts: emptyToUndefined(values.contacts),
    country: values.country || null,
  };

  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'invalid',
      fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))],
      values,
    };
  }

  const userId = await getUserId();
  if (!userId) return { status: 'error', values };
  const supabase = await createClient();

  const { data: before } = await supabase.from('profiles').select('country').eq('id', userId).maybeSingle();
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      timezone: parsed.data.timezone,
      contacts: parsed.data.contacts,
      country: parsed.data.country,
    })
    .eq('id', userId);
  if (error) return { status: 'error', values };

  // The country feeds match scoring: re-evaluate existing matches for the user's active searches.
  if (before && before.country !== parsed.data.country) {
    const { data: searches } = await supabase.from('search_profiles').select('id').eq('user_id', userId).eq('is_active', true);
    for (const search of searches ?? []) await requestProfileSync(search.id);
  }

  revalidatePath('/[locale]/profile', 'page');
  return { status: 'saved' };
}
