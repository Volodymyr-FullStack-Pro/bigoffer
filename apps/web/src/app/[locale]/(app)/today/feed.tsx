'use client';

import { JOB_DOMAINS } from '@jp/core';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlowCard } from '@/components/ui/glow-card';
import { Toast, useToast } from '@/components/ui/toast';
import { Link } from '@/i18n/navigation';
import { tellGenie } from '@/lib/genie/events';
import { useSaveUiPrefs } from '@/lib/use-save-ui-prefs';
import { setUrlParam } from '@/lib/use-stored-state';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { hideMatch, restoreMatch, saveMatch } from './actions';
import { DEFAULT_FILTERS, filterMatches, sortMatches, type FeedFilters } from './feed-filter';
import { ALL_LABELS, type CardLabels, CardLabelsContext } from './domain-badges';
import { FeedListItem } from './feed-list-item';
import { LabelsMenu } from './labels-menu';
import type { FeedMatch } from './feed-types';
import { MatchDetail, type MatchAction } from './match-detail';
import { SwipeCard } from './swipe-card';

type Done = { match: FeedMatch; index: number; action: MatchAction };

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/** Saved filters, minus choices that no longer exist (a deleted profile, a board with no matches left). */
function initialFilters(saved: Partial<FeedFilters> | undefined, profiles: { id: string }[], sources: { id: string }[]): FeedFilters {
  const f = { ...DEFAULT_FILTERS, ...saved };
  if (f.profileId !== 'all' && !profiles.some((p) => p.id === f.profileId)) f.profileId = 'all';
  if (f.source !== 'all' && !sources.some((s) => s.id === f.source)) f.source = 'all';
  return f;
}

export function Feed({
  matches,
  profiles,
  sources,
  focusId = null,
  savedFilters,
  ruleHidden = [],
  savedLabels,
  openHidden = false,
  onlyFresh = false,
  openKit = false,
  userId = null,
}: {
  /** For the live "new jobs" banner (new matches of this user arrive while the page is open). */
  userId?: string | null;
  matches: FeedMatch[];
  /** Matches the profile rules hid, browsable with the "Hidden by rules" toggle. */
  ruleHidden?: FeedMatch[];
  savedLabels?: Partial<CardLabels>;
  openHidden?: boolean;
  onlyFresh?: boolean;
  openKit?: boolean;
  profiles: { id: string; name: string }[];
  sources: { id: string; name: string }[];
  focusId?: string | null;
  savedFilters?: Partial<FeedFilters>;
}) {
  const t = useTranslations('feed');
  const tt = useTranslations('today');
  // Decided once: a save/hide server action re-renders the page with fewer matches, which must not turn the feed into the "no matches yet" state.
  // Only a truly empty feed gets the bare "all caught up" card: with rule-hidden jobs the feed stays, so they can be opened.
  const [startedEmpty] = useState(matches.length === 0 && ruleHidden.length === 0);
  const [mainItems, setMainItems] = useState(matches);
  const [hiddenItems, setHiddenItems] = useState(ruleHidden);
  const [showHidden, setShowHidden] = useState(openHidden && ruleHidden.length > 0);
  // The toggle swaps which list the feed (and its actions) works on.
  const items = showHidden ? hiddenItems : mainItems;
  const setItems = showHidden ? setHiddenItems : setMainItems;
  const [filters, setFilters] = useState<FeedFilters>(() => ({ ...initialFilters(savedFilters, profiles, sources), ...(onlyFresh ? { fresh: true } : {}) }));
  const saveUiPrefs = useSaveUiPrefs();
  const [labels, setLabels] = useState<CardLabels>({ ...ALL_LABELS, ...savedLabels });
  // The less used filters fold away; open when one of them is set, else as the user left it.
  const moreActive = [filters.profileId !== 'all', filters.level !== 'all', filters.experience !== 'any', filters.remote !== 'any', filters.domain !== 'all', filters.source !== 'all'].filter(Boolean).length;
  const [moreOpen, setMoreOpen] = useState(() => {
    if (moreActive > 0) return true;
    try {
      return typeof window !== 'undefined' && localStorage.getItem('bigoffer:feed:filters-open') === '1';
    } catch {
      return false;
    }
  });
  const toggleMore = (open: boolean) => {
    setMoreOpen(open);
    try {
      localStorage.setItem('bigoffer:feed:filters-open', open ? '1' : '0');
    } catch {
      // ignore
    }
  };
  const firstFilters = useRef(filters);
  // Every filter change is remembered for this user (all devices) until they change it again.
  useEffect(() => {
    if (filters !== firstFilters.current) saveUiPrefs({ feed: filters });
  }, [filters, saveUiPrefs]);
  const [selectedId, setSelectedId] = useState<string | null>(focusId ?? matches[0]?.id ?? null);
  const [done, setDone] = useState<Done[]>([]);
  const { toast, show, close } = useToast();

  // The focused match (?match=) leads the list: selected on desktop, the first card on mobile.
  const visible = useMemo(() => {
    const sorted = sortMatches(filterMatches(items, filters), filters.sort);
    const focused = focusId ? sorted.find((m) => m.id === focusId) : undefined;
    return focused ? [focused, ...sorted.filter((m) => m !== focused)] : sorted;
  }, [items, filters, focusId]);
  const selected = visible.find((m) => m.id === selectedId) ?? visible[0] ?? null;
  // Matches created while the page is open (the radar, a scan): counted into a banner, shown on request, so the list
  // never jumps under the reader.
  const [arrived, setArrived] = useState(0);
  useEffect(() => {
    if (!userId) return;
    const supabase = createBrowserSupabase();
    const channel = supabase
      .channel(`matches-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'job_matches', filter: `user_id=eq.${userId}` }, (payload) => {
        if ((payload.new as { state?: string }).state === 'new') setArrived((n) => n + 1);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // The open job is part of the URL: a reload (or a shared link) opens it again.
  useEffect(() => {
    if (selected) setUrlParam('match', selected.id);
  }, [selected]);

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
      if (action !== 'hide') tellGenie({ type: action === 'applied' ? 'applied' : 'saved' });
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
    [items, setItems, visible, show, t],
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
    [setItems, visible, show, t],
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
  // Matches the current filters (fresh only, score, level…) keep out of view.
  const filteredOut = items.length - visible.length;
  const total = processed + visible.length;
  const savedCount = done.filter((d) => d.action !== 'hide').length;

  const labelsMenu = (
    <LabelsMenu
      value={labels}
      onChange={(next) => {
        setLabels(next);
        saveUiPrefs({ cardLabels: next });
      }}
    />
  );

  const select = (testId: string, label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[]) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select data-testid={testId} value={value} onChange={(e) => onChange(e.target.value)} className="h-[34px] rounded-xl border border-border bg-card px-2.5 font-sans text-sm text-foreground">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );

  if (startedEmpty) {
    return (
      <div data-testid="today-empty" data-reason={profiles.length > 0 ? 'caught-up' : 'no-search'} className="brutal flex max-w-xl flex-col gap-4 p-6">
        <p className="text-lg">{tt(profiles.length > 0 ? 'caughtUp' : 'empty')}</p>
        {profiles.length > 0 ? (
          <Link href="/board" className="btn brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">{t('toBoard')}</Link>
        ) : (
          <Link href="/search" className="btn brutal-press self-start bg-brand px-4 py-2 font-semibold text-brand-foreground">
            {tt('setup')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <CardLabelsContext.Provider value={labels}>
    <section data-testid="feed" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {total > 0 && <p data-testid="feed-progress" className="text-sm text-muted-foreground"><span className="tabular-nums font-bold text-foreground">{processed}/{total}</span> {t('progressLabel')}</p>}
          {(ruleHidden.length > 0 || showHidden) && (
            <button
              type="button"
              data-testid="toggle-rule-hidden"
              aria-pressed={showHidden}
              onClick={() => {
                setShowHidden((v) => !v);
                setSelectedId(null);
              }}
              className={`brutal-press rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                showHidden ? 'border-warning/60 bg-warning/15 text-warning' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {showHidden ? t('ruleHiddenBack') : t('ruleHiddenShow', { count: hiddenItems.length })}
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {select('sort-select', tt('sortLabel'), filters.sort, (v) => setFilters((f) => ({ ...f, sort: v as FeedFilters['sort'] })), [{ value: 'best', label: tt('sortBest') }, { value: 'newest', label: tt('sortNewest') }])}
          {select('filter-min-score', t('filterScore'), String(filters.minScore), (v) => setFilters((f) => ({ ...f, minScore: Number(v) })), [0, 50, 70, 90].map((n) => ({ value: String(n), label: n === 0 ? t('all') : `≥ ${n}%` })))}
          <button
            type="button"
            data-testid="filters-toggle"
            aria-expanded={moreOpen}
            onClick={() => toggleMore(!moreOpen)}
            className={`brutal-press inline-flex h-[34px] items-center gap-1.5 rounded-xl border px-3 text-sm font-medium ${moreActive > 0 ? 'border-brand/60 bg-brand/10 text-link' : 'border-border bg-card'}`}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            {t('moreFilters')}
            {moreActive > 0 && <span className="rounded-full bg-brand px-1.5 tabular-nums text-[11px] font-bold text-brand-foreground">{moreActive}</span>}
          </button>
          {/* Phone: card labels live in the filters panel, so the bar stays one row. */}
          <div className="hidden sm:block">{labelsMenu}</div>
        </div>
      </div>
      {/* Quick toggles: one tap, always visible. */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {([
          ['filter-fresh', tt('filterFresh'), filters.fresh, (on: boolean) => setFilters((f) => ({ ...f, fresh: on }))],
          ['filter-reservation', t('filterReservation'), filters.reservation, (on: boolean) => setFilters((f) => ({ ...f, reservation: on }))],
          ['filter-no-army', t('filterNoArmy'), filters.noArmy, (on: boolean) => setFilters((f) => ({ ...f, noArmy: on }))],
        ] as const).map(([id, label, on, set]) => (
          <label
            key={id}
            className={`brutal-press inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${on ? 'border-brand/60 bg-brand/15 text-link' : 'border-border hover:bg-muted'}`}
          >
            <input data-testid={id} type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="size-4 accent-[var(--brand)]" />
            {label}
          </label>
        ))}
      </div>
      {moreOpen && (
        <div data-testid="filters-panel" className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-card/60 p-3 sm:grid-cols-3 lg:grid-cols-6">
          {profiles.length > 1 && select('filter-profile', t('filterProfile'), filters.profileId, (v) => setFilters((f) => ({ ...f, profileId: v })), [{ value: 'all', label: t('all') }, ...profiles.map((p) => ({ value: p.id, label: p.name }))])}
          {select('filter-level', t('filterLevel'), filters.level, (v) => setFilters((f) => ({ ...f, level: v as FeedFilters['level'] })), [
            { value: 'all', label: t('all') },
            ...(['intern', 'junior', 'middle', 'senior', 'lead'] as const).map((l) => ({ value: l, label: tt(`seniority_${l}`) })),
          ])}
          {select('filter-experience', t('filterExperience'), String(filters.experience), (v) => setFilters((f) => ({ ...f, experience: v === 'any' || v === 'fit' ? v : Number(v) })), [
            { value: 'any', label: t('all') },
            { value: 'fit', label: t('expFit') },
            ...[1, 2, 3, 5].map((n) => ({ value: String(n), label: t('expUpTo', { years: n }) })),
          ])}
          {select('filter-remote', t('filterRemote'), filters.remote, (v) => setFilters((f) => ({ ...f, remote: v as FeedFilters['remote'] })), (['any', 'remote', 'hybrid', 'office'] as const).map((r) => ({ value: r, label: t(`remote_${r}`) })))}
          {select('filter-domain', t('filterDomain'), filters.domain, (v) => setFilters((f) => ({ ...f, domain: v as FeedFilters['domain'] })), [
            { value: 'all', label: t('all') },
            ...JOB_DOMAINS.filter((d) => d !== 'military').map((d) => ({ value: d, label: t(`domain_${d}`) })),
          ])}
          {select('filter-source', t('filterSource'), filters.source, (v) => setFilters((f) => ({ ...f, source: v })), [{ value: 'all', label: t('all') }, ...sources.map((s) => ({ value: s.id, label: s.name }))])}
          <div className="flex items-end sm:hidden">{labelsMenu}</div>
          {moreActive > 0 && (
            <button
              type="button"
              data-testid="filters-reset"
              onClick={() => setFilters((f) => ({ ...f, profileId: 'all', level: 'all', experience: 'any', remote: 'any', domain: 'all', source: 'all' }))}
              className="col-span-full justify-self-start text-sm text-link underline"
            >
              {t('resetFilters')}
            </button>
          )}
        </div>
      )}

      {arrived > 0 && (
        <button
          type="button"
          data-testid="feed-arrived"
          onClick={() => window.location.reload()}
          className="btn brutal-press self-center bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
        >
          {t('arrived', { count: arrived })}
        </button>
      )}
      {showHidden && (
        <p data-testid="rule-hidden-note" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
          {t('ruleHiddenNote')}{' '}
          <Link href="/search" className="font-semibold underline">{t('ruleHiddenSettings')}</Link>
        </p>
      )}
      {visible.length === 0 ? (
        // Say why it is empty: all reviewed, the filters hide matches, or nothing new yet; and offer the way out.
        <div data-testid="feed-empty" data-reason={filteredOut > 0 ? 'filters' : processed > 0 ? 'done' : 'nothing'} className="brutal flex max-w-xl flex-col gap-3 p-6">
          <p className="font-display text-xl font-semibold">
            {filteredOut > 0 ? t('emptyFiltered', { count: filteredOut }) : processed > 0 ? t('empty') : t('emptyNothingNew')}
          </p>
          {processed > 0 && <p className="text-muted-foreground">{t('emptyStats', { saved: savedCount, hidden: processed - savedCount })}</p>}
          {filteredOut === 0 && !showHidden && <p className="text-sm text-muted-foreground">{t('emptyCadence')}</p>}
          <div className="flex flex-wrap gap-2">
            {filteredOut > 0 && (
              <button type="button" data-testid="feed-empty-show-all" onClick={() => setFilters((f) => ({ ...DEFAULT_FILTERS, sort: f.sort }))} className="btn brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">
                {t('emptyShowAll', { count: filteredOut })}
              </button>
            )}
            {!showHidden && hiddenItems.length > 0 && (
              <button type="button" data-testid="feed-empty-rule-hidden" onClick={() => { setShowHidden(true); setSelectedId(null); }} className="btn brutal-press px-4 py-2 font-semibold">
                {t('emptyRuleHidden', { count: hiddenItems.length })}
              </button>
            )}
            {filteredOut === 0 && <Link href="/board" className="btn brutal-press px-4 py-2 font-semibold">{t('toBoard')}</Link>}
          </div>
        </div>
      ) : (
        <>
          <div className="hidden gap-6 md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <GlowCard className="self-start">
              <nav aria-label={t('list')} className="brutal max-h-[75vh] overflow-y-auto p-0">
                {visible.map((m) => (
                  <FeedListItem key={m.id} match={m} selected={m.id === selected?.id} onSelect={() => setSelectedId(m.id)} />
                ))}
              </nav>
            </GlowCard>
            {selected && (
              // Sticky: the details stay in view while the list scrolls.
              <GlowCard className="sticky top-20 self-start rounded-2xl border border-border">
                {/* Scrolls on its own, so the action bar at its bottom never leaves the screen. */}
                <div key={selected.id} data-testid="match-detail-scroll" className="max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl bg-card p-6 [scrollbar-width:thin]">
                  <MatchDetail match={selected} onAction={(a) => void act(selected, a)} onApplied={() => appliedFromKit(selected)} kitOpen={openKit && selected.id === focusId} />
                </div>
              </GlowCard>
            )}
          </div>
          <div className="md:hidden">
            {visible[0] && <SwipeCard key={visible[0].id} match={visible[0]} onAction={(a) => void act(visible[0]!, a)} onApplied={() => appliedFromKit(visible[0]!)} kitOpen={openKit && visible[0].id === focusId} />}
          </div>
        </>
      )}
      <Toast toast={toast} onClose={close} />
    </section>
    </CardLabelsContext.Provider>
  );
}
