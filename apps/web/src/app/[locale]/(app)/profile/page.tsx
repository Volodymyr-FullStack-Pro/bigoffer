import { COUNTRY_CODES, contactsSchema, isLocale } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { privateAiAvailable } from '@/lib/ai';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AnswerBank } from './answer-bank';
import { CvSection } from './cv-section';
import { loadProfileExtras } from './extras-data';
import { LetterTemplate } from './letter-template';
import { ProfileForm } from './profile-form';

export default async function ProfilePage() {
  const t = await getTranslations('profile');
  const userId = await requireUserId();
  const supabase = await createClient();
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, timezone, contacts, country')
    .eq('id', userId)
    .single();

  if (error || !profile) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
        <p role="alert" className="text-danger">{t('error')}</p>
      </section>
    );
  }

  const contacts = contactsSchema.safeParse(profile.contacts ?? {});

  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const { cv, cvLink, answers, template } = await loadProfileExtras(supabase, userId, locale);
  const regionNames = new Intl.DisplayNames([locale], { type: 'region' });
  const countries = COUNTRY_CODES.map((code) => ({ code, name: regionNames.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, locale),
  );

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      <ProfileForm
        fullName={profile.full_name ?? ''}
        timezone={profile.timezone ?? 'Europe/Kyiv'}
        country={profile.country ?? ''}
        countries={countries}
        contacts={contacts.success ? contacts.data : {}}
        timeZones={Intl.supportedValuesOf('timeZone')}
      />
      <CvSection cv={cv ? { fileName: cv.fileName, parsed: cv.parsed, parseError: cv.parseError } : null} aiAvailable={privateAiAvailable()} cvLink={cvLink} />
      <LetterTemplate body={template} locale={locale} />
      <AnswerBank answers={answers} locale={locale} />
    </section>
  );
}
