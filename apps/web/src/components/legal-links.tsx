import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

export async function LegalLinks({ className }: { className?: string }) {
  const t = await getTranslations('legal');
  return (
    <p className={className}>
      <Link href="/privacy" className="underline">
        {t('footerPrivacy')}
      </Link>
      {' · '}
      <Link href="/terms" className="underline">
        {t('footerTerms')}
      </Link>
    </p>
  );
}
