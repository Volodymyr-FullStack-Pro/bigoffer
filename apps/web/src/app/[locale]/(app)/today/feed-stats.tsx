import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** Four numbers over the feed; each leads to where it can be acted on. */
export async function FeedStats({ strong, saved, silent, week }: { strong: number; saved: number; silent: number; week: number }) {
  const t = await getTranslations('feedStats');
  const items = [
    { key: 'strong', value: strong, href: '/today?fresh=1', hint: strong > 0 ? t('strongHint') : t('strongNone') },
    { key: 'saved', value: saved, href: '/board', hint: saved > 0 ? t('savedHint') : t('savedNone') },
    { key: 'silent', value: silent, href: '/board', hint: silent > 0 ? t('silentHint') : t('silentNone') },
    { key: 'week', value: week, href: '/analytics', hint: week > 0 ? t('weekHint') : t('weekNone') },
  ] as const;
  return (
    <nav aria-label={t('label')} data-testid="feed-stats" className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border md:grid-cols-4">
      {items.map((it, i) => (
        <Link
          key={it.key}
          href={it.href}
          data-testid={`feed-stat-${it.key}`}
          className={`flex flex-col gap-1 p-4 transition-colors hover:bg-muted ${i % 2 ? 'border-l border-border' : ''} ${i >= 2 ? 'border-t border-border md:border-t-0' : ''} ${i === 2 ? 'md:border-l' : ''}`}
        >
          <span className={`font-display text-3xl font-extrabold tabular-nums ${it.key === 'silent' && it.value > 0 ? 'text-warning' : it.key === 'strong' && it.value > 0 ? 'text-brand' : ''}`}>{it.value}</span>
          <span className="text-sm font-semibold">{t(it.key)}</span>
          <span className="text-xs text-muted-foreground">{it.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
