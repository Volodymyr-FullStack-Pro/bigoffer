'use server';

import { emptyToUndefined, profileUpdateSchema } from '@jp/core';
import { revalidatePath } from 'next/cache';
import { getUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export type ProfileValues = { full_name: string; timezone: string; contacts: Record<string, string> };
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
    contacts: Object.fromEntries(
      CONTACT_KEYS.map((key) => [key, String(formData.get(`contacts.${key}`) ?? '')]),
    ),
  };
  const raw = {
    full_name: values.full_name,
    timezone: values.timezone,
    contacts: emptyToUndefined(values.contacts),
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

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      timezone: parsed.data.timezone,
      contacts: parsed.data.contacts,
    })
    .eq('id', userId);
  if (error) return { status: 'error', values };

  revalidatePath('/[locale]/profile', 'page');
  return { status: 'saved' };
}
