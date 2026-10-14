import { getTranslations } from 'next-intl/server';
import { requireUserId } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Library } from './library';
import type { SavedLink } from './topics';

export default async function LibraryPage() {
  await requireUserId();
  const t = await getTranslations('library');
  const supabase = await createClient();
  const { data } = await supabase.from('saved_links').select('id, url, title, topic, note, created_at').order('created_at', { ascending: false }).limit(500);
  const links: SavedLink[] = (data ?? []).map((l) => ({ id: l.id, url: l.url, title: l.title, topic: l.topic, note: l.note, createdAt: l.created_at }));
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold md:text-4xl">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </div>
      <Library initial={links} />
    </section>
  );
}
