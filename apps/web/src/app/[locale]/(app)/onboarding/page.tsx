import { isLocale } from '@jp/core';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { privateAiAvailable } from '@/lib/ai';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { AnswerBank } from '../profile/answer-bank';
import { CvSection } from '../profile/cv-section';
import { loadProfileExtras } from '../profile/extras-data';
import { LetterTemplate } from '../profile/letter-template';
import { finishOnboarding } from './onboarding-actions';

export default async function OnboardingPage() {
  const t = await getTranslations('onboarding');
  const userId = await requireUserId();
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : 'en';
  const supabase = await createClient();
  const { cv, cvLink, answers, template } = await loadProfileExtras(supabase, userId, locale);
  const step = 'flex flex-col gap-3';
  return (
    <section data-testid="onboarding" className="flex flex-col gap-6">
      <h1 className="text-3xl font-black md:text-4xl">{t('title')}</h1>
      <ol className="flex list-decimal flex-col gap-8 pl-6 marker:font-bold">
        <li className={step}>
          <h2 className="font-display text-lg font-bold">{t('stepCv')}</h2>
          <CvSection cv={cv ? { fileName: cv.fileName, parsed: cv.parsed, parseError: cv.parseError } : null} aiAvailable={privateAiAvailable()} cvLink={cvLink} />
        </li>
        <li className={step}>
          <h2 className="font-display text-lg font-bold">{t('stepSearch')}</h2>
          <Link href="/search" className="brutal brutal-press self-start px-4 py-2 font-semibold">{t('manualSearch')}</Link>
        </li>
        <li className={step}>
          <h2 className="font-display text-lg font-bold">{t('stepTemplate')}</h2>
          <LetterTemplate body={template} locale={locale} />
        </li>
        <li className={step}>
          <h2 className="font-display text-lg font-bold">{t('stepAnswers')}</h2>
          <AnswerBank answers={answers} locale={locale} />
        </li>
      </ol>
      <form action={finishOnboarding}>
        <button type="submit" data-testid="onboarding-finish" className="brutal brutal-press bg-brand px-6 py-3 font-semibold text-brand-foreground">{t('finish')}</button>
      </form>
    </section>
  );
}
