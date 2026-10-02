'use server';

import { emptyToUndefined, profileUpdateSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ProfileState = { status: 'idle' | 'saved' | 'invalid' | 'error'; fields?: string[] };

const CONTACT_KEYS = ['email', 'phone', 'linkedin', 'github', 'portfolio', 'telegram'] as const;

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const raw = {
    full_name: String(formData.get('full_name') ?? ''),
    timezone: String(formData.get('timezone') ?? ''),
    contacts: emptyToUndefined(
      Object.fromEntries(
        CONTACT_KEYS.map((key) => [key, String(formData.get(`contacts.${key}`) ?? '')]),
      ),
    ),
  };

  const parsed = profileUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'invalid',
      fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))],
    };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) return { status: 'error' };

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      timezone: parsed.data.timezone,
      contacts: parsed.data.contacts,
    })
    .eq('id', userId);
  if (error) return { status: 'error' };

  revalidatePath('/[locale]/profile', 'page');
  return { status: 'saved' };
}
