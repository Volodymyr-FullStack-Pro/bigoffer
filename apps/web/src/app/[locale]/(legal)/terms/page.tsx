import { getTranslations } from 'next-intl/server';
import { LegalDocument } from '@/components/legal-document';

export default async function TermsPage() {
  const t = await getTranslations('legal.terms');
  return (
    <LegalDocument
      title={t('title')}
      intro={t('intro')}
      sections={[
        { title: t('s1.title'), body: t('s1.body') },
        { title: t('s2.title'), body: t('s2.body') },
        { title: t('s3.title'), body: t('s3.body') },
        { title: t('s4.title'), body: t('s4.body') },
        { title: t('s5.title'), body: t('s5.body') },
        { title: t('s6.title'), body: t('s6.body') },
      ]}
    />
  );
}
