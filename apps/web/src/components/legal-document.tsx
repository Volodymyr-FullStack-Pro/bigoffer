import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { LEGAL_CONTACT_EMAIL, LEGAL_UPDATED } from '@/lib/legal';

export type LegalSection = { title: string; body: string };

export async function LegalDocument({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  const t = await getTranslations('legal');
  const tApp = await getTranslations('app');
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-black">{tApp('name')}</span>
        <Link href="/login" className="text-sm underline">
          {t('back')}
        </Link>
      </div>
      <article className="brutal flex flex-col gap-6 p-6">
        <header>
          <h1 className="font-display text-3xl font-black">{title}</h1>
          <p className="mt-1 font-mono text-xs uppercase text-muted-foreground">
            {t('updated', { date: LEGAL_UPDATED })}
          </p>
          <p className="mt-4">{intro}</p>
        </header>
        {sections.map((s, i) => (
          <section key={i}>
            <h2 className="font-display text-xl font-black">
              {i + 1}. {s.title}
            </h2>
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{s.body}</p>
          </section>
        ))}
        <p>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-bold underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
      </article>
    </main>
  );
}
