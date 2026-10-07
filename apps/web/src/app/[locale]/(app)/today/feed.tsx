'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Toast, useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { hideMatch, restoreMatch, saveMatch } from './actions';
import { DEFAULT_FILTERS, filterMatches, type FeedFilters } from './feed-filter';
import { FeedListItem } from './feed-list-item';
import type { FeedMatch } from './feed-types';
import { MatchDetail, type MatchAction } from './match-detail';
import { SwipeCard } from './swipe-card';

type Done = { match: FeedMatch; index: number; action: MatchAction };

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

export function Feed({ matches, profiles, sources }: { matches: FeedMatch[]; profiles: { id: string; name: string }[]; sources: { id: string; name: string }[] }) {
  const t = useTranslations('feed');
  const tt = useTranslations('today');
  // Decided once: a save/hide server action re-renders the page with fewer matches, which must not turn the feed into the "no matches yet" state.
  const [startedEmpty] = useState(matches.length === 0);
  const [items, setItems] = useState(matches);
  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(matches[0]?.id ?? null);
  const [done, setDone] = useState<Done[]>([]);
  const { toast, show, close } = useToast();

  const visible = useMemo(() => filterMatches(items, filters), [items, filters]);
  const selected = visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;

  const act = useCallback(
    async (match: FeedMatch, action: MatchAction) => {
      const index = items.findIndex((m) => m.id === match.id);
      if (index < 0) return;
      const next = visible[visible.findIndex((m) => m.id === match.id) + 1] ?? null;
      setItems((list) => list.filter((m) => m.id !== match.id));
      setSelectedId(next?.id ?? null);
      const restoreLocal = () => {
        setItems((list) => (list.some((m) => m.id === match.id) ? list : [...list.slice(0, index), match, ...list.slice(index)]));
        setSelectedId(match.id);
      };
      let applicationId: string | null = null;
      let existing = false;
      if (action === 'hide') {
        if (!(await hideMatch(match.id))) {
          restoreLocal();
          return show({ message: t('error'), tone: 'error' });
        }
      } else {
        const res = await saveMatch(match.id, action);
        if (!res.ok) {
          restoreLocal();
          return show({ message: t('error'), tone: 'error' });
        }
        if (res.created) applicationId = res.applicationId;
        else existing = true;
      }
      setDone((d) => [...d, { match, index, action }]);
      show({
        message: t(action === 'hide' ? 'hidden' : existing ? 'alreadyOnBoard' : action === 'saved' ? 'saved' : 'appliedDone', { title: match.title }),
        undoLabel: t('undo'),
        onUndo: async () => {
          if (!(await restoreMatch(match.id, applicationId))) return show({ message: t('error'), tone: 'error' });
          restoreLocal();
          setDone((d) => d.filter((x) => x.match.id !== match.id));
        },
      });
    },
    [items, visible, show, t],
  );

  // The kit's "Did you apply? Yes" already moved the card on the server: just take the match out of the feed.
  const appliedFromKit = useCallback(
    (match: FeedMatch) => {
      const next = visible[visible.findIndex((m) => m.id === match.id) + 1] ?? null;
      setItems((list) => list.filter((m) => m.id !== match.id));
      setSelectedId(next?.id ?? null);
      setDone((d) => [...d, { match, index: 0, action: 'applied' }]);
      show({ message: t('appliedDone', { title: match.title }) });
    },
    [visible, show, t],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (!isDesktop() || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName))) return;
      const i = selected ? visible.findIndex((m) => m.id === selected.id) : -1;
      const key = e.key.toLowerCase();
      if (key === 'j' && visible[i + 1]) setSelectedId(visible[i + 1]!.id);
      else if (key === 'k' && i > 0) setSelectedId(visible[i - 1]!.id);
      else if (!selected) return;
      else if (key === 's') void act(selected, 'saved');
      else if (key === 'h') void act(selected, 'hide');
      else if (key === 'a') void act(selected, 'applied');
      else if (key === 'o') {
        const url = selected.postings.find((p) => /^https?:\/\//i.test(p.url))?.url;
        if (url) window.open(url, '_blank', 'noopener');
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [act, selected, visible]);

  const processed = done.length;
  const total = processed + visible.length;
  const savedCount = done.filter((d) => d.action !== 'hide').length;

  const select = (testId: string, label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <label className="flex flex-col gap-1 font-mono text-xs uppercase">
      {label}
      <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="brutal bg-card px-2 py-1 font-sans text-sm normal-case">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );

  if (startedEmpty) {
    return (
      <div data-testid="today-empty" className="brutal flex max-w-xl flex-col gap-4 p-6">
        <p className="text-lg">{tt('empty')}</p>
        <Link href="/search" className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">
          {tt('setup')}
        </Link>
      </div>
    );
  }

  return (
    <section data-testid="feed" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p data-testid="feed-progress" className="font-mono text-sm font-bold">{t('progress', { done: processed, total })}</p>
        <div className="flex flex-wrap gap-2">
          {profiles.length > 1 && select('filter-profile', t('filterProfile'), filters.profileId, (v) => setFilters((f) => ({ ...f, profileId: v })), [{ value: 'all', label: t('all') }, ...profiles.map((p) => ({ value: p.id, label: p.name }))])}
          {select('filter-min-score', t('filterScore'), String(filters.minScore), (v) => setFilters((f) => ({ ...f, minScore: Number(v) })), [0, 50, 70, 90].map((n) => ({ value: String(n), label: n === 0 ? t('all') : `≥ ${n}%` })))}
          {select('filter-remote', t('filterRemote'), filters.remote, (v) => setFilters((f) => ({ ...f, remote: v as FeedFilters['remote'] })), (['any', 'remote', 'hybrid', 'office'] as const).map((r) => ({ value: r, label: t(`remote_${r}`) })))}
          {select('filter-source', t('filterSource'), filters.source, (v) => setFilters((f) => ({ ...f, source: v })), [{ value: 'all', label: t('all') }, ...sources.map((s) => ({ value: s.id, label: s.name }))])}
        </div>
      </div>

      {visible.length === 0 ? (
        <div data-testid="feed-empty" className="brutal flex max-w-xl flex-col gap-3 p-6">
          <p className="font-display text-xl font-black">{t('empty')}</p>
          <p className="text-muted-foreground">{t('emptyStats', { saved: savedCount, hidden: processed - savedCount })}</p>
          <Link href="/board" className="brutal brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('toBoard')}</Link>
        </div>
      ) : (
        <>
          <div className="hidden gap-6 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <nav aria-label={t('list')} className="brutal max-h-[75vh] overflow-y-auto p-0">
              {visible.map((m) => (
                <FeedListItem key={m.id} match={m} selected={m.id === selected?.id} onSelect={() => setSelectedId(m.id)} />
              ))}
            </nav>
            {selected && (
              <div className="brutal p-5">
                <MatchDetail match={selected} onAction={(a) => void act(selected, a)} onApplied={() => appliedFromKit(selected)} />
              </div>
            )}
          </div>
          <div className="md:hidden">
            {visible[0] && <SwipeCard key={visible[0].id} match={visible[0]} onAction={(a) => void act(visible[0]!, a)} onApplied={() => appliedFromKit(visible[0]!)} />}
          </div>
        </>
      )}
      <Toast toast={toast} onClose={close} />
    </section>
  );
}
