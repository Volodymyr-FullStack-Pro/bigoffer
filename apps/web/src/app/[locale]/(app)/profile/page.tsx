import { contactsSchema } from '@jp/core';
import { getTranslations } from 'next-intl/server';
import { createClient } from '@/lib/supabase/server';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const t = await getTranslations('profile');
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, timezone, contacts')
    .eq('id', claims?.claims.sub ?? '')
    .single();

  const contacts = contactsSchema.safeParse(profile?.contacts ?? {});

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      <ProfileForm
        fullName={profile?.full_name ?? ''}
        timezone={profile?.timezone ?? 'Europe/Kyiv'}
        contacts={contacts.success ? contacts.data : {}}
      />
    </section>
  );
}
