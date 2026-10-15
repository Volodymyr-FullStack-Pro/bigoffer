import { getTranslations } from 'next-intl/server';

export async function ComingSoon({ page }: { page: 'board' | 'analytics' | 'prep' }) {
  const tPages = await getTranslations('pages');
  const t = await getTranslations('comingSoon');

  return (
    <section className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold md:text-4xl">{tPages(`${page}.title`)}</h1>
      <div className="brutal relative max-w-xl -rotate-1 p-6">
        <span className="absolute -top-3 right-4 rotate-3 rounded-sm border-[1.5px] border-border bg-brand px-2 tabular-nums text-xs text-brand-foreground">
          {t('badge')}
        </span>
        <p className="text-lg">{t(page)}</p>
      </div>
    </section>
  );
}
