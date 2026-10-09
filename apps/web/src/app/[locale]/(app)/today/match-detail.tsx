'use client';

import { isLocale, type Locale, sourceInfo } from '@jp/core';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { TextGenerateEffect } from '@/components/aceternity/text-generate-effect';
import { ApplyKitPanel } from '@/components/apply-kit/apply-kit-panel';
import { PeopleSearch } from '@/components/apply-kit/people-search';
import { ScoreMeter } from '@/components/ui/score-meter';
import type { FeedMatch } from './feed-types';

export type MatchAction = 'saved' | 'applied' | 'hide';

export function salaryText(t: ReturnType<typeof useTranslations>, m: Pick<FeedMatch, 'salaryMinUsd' | 'salaryMaxUsd'>) {
  if (m.salaryMinUsd && m.salaryMaxUsd && m.salaryMinUsd !== m.salaryMaxUsd) return t('salary', { min: m.salaryMinUsd, max: m.salaryMaxUsd });
  if (m.salaryMinUsd) return t('salaryFrom', { min: m.salaryMinUsd });
  if (m.salaryMaxUsd) return t('salaryTo', { max: m.salaryMaxUsd });
  return null;
}

export function MatchActions({ onAction, compact = false }: { onAction: (a: MatchAction) => void; compact?: boolean }) {
  const t = useTranslations('feed');
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'justify-between' : ''}`}>
      <button type="button" data-testid="match-hide" onClick={() => onAction('hide')} className="brutal brutal-press px-4 py-2 font-semibold">
        {t('hide')} {!compact && <kbd className="font-mono text-xs opacity-60">H</kbd>}
      </button>
      <button type="button" data-testid="match-save" onClick={() => onAction('saved')} className="brutal brutal-press px-4 py-2 font-semibold">
        {t('save')} {!compact && <kbd className="font-mono text-xs opacity-60">S</kbd>}
      </button>
      <button type="button" data-testid="match-applied" onClick={() => onAction('applied')} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground">
        {t('applied')} {!compact && <kbd className="font-mono text-xs opacity-60">A</kbd>}
      </button>
    </div>
  );
}

function ApplyKitToggle({ jobId, onApplied }: { jobId: string; onApplied?: () => void }) {
  const tk = useTranslations('kit');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <button type="button" data-testid="apply-kit-open" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="brutal brutal-press self-start px-4 py-2 font-semibold">
        {tk('open')}
      </button>
      {open && <ApplyKitPanel jobId={jobId} locale={locale} hidePeopleSearch onApplied={onApplied} />}
    </div>
  );
}

export function MatchDetail({ match, onAction, onApplied, showDescription = true }: { match: FeedMatch; onAction?: (a: MatchAction) => void; onApplied?: () => void; showDescription?: boolean }) {
  const t = useTranslations('today');
  const tf = useTranslations('feed');
  const format = useFormatter();
  const now = useNow();
  const salary = salaryText(t, match);
  return (
    <article data-testid="match-detail" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ScoreMeter score={match.score} label={t('match')} />
        <h2 className="font-display text-2xl font-semibold leading-tight">{match.title}</h2>
        <p className="text-muted-foreground">{match.company}</p>
        <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
          <span>{t(`remote_${match.remoteType}`)}</span>
          {match.location && <span>{match.location}</span>}
          {match.seniority && <span>{t(`seniority_${match.seniority}`)}</span>}
          {salary && <span>{salary}</span>}
          <span suppressHydrationWarning>{format.relativeTime(new Date(match.createdAt), now)}</span>
        </p>
      </div>
      {match.summary && <TextGenerateEffect key={`summary-${match.id}`} testId="match-summary" words={match.summary} className="text-[15px] leading-relaxed" />}
      {match.why && (
        <p data-testid="match-why" className="border-l-4 border-ai pl-3 text-sm">
          <span className="font-semibold">{t('why')}: </span>
          {match.why}
        </p>
      )}
      {(match.skills.length > 0 || match.missingSkills.length > 0) && (
        <ul className="flex flex-wrap gap-1.5" aria-label={tf('skills')}>
          {match.skills.map((s) => (
            <li key={s.name} data-testid="match-skill" data-matched={s.matched} className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s.matched ? 'bg-brand/15 text-link' : 'bg-muted text-muted-foreground'}`}>
              {s.matched ? '✓ ' : ''}{s.name}
            </li>
          ))}
          {match.missingSkills.map((name) => (
            <li key={`missing-${name}`} className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground">
              ✗ {name}
            </li>
          ))}
        </ul>
      )}
      {match.breakdown && (
        <dl className="grid grid-cols-5 gap-2 font-mono text-xs" aria-label={tf('breakdown')}>
          {(['skills', 'role', 'seniority', 'location', 'salary'] as const).map((k) => (
            <div key={k} className="flex flex-col">
              <dt className="text-muted-foreground">{tf(`part_${k}`)}</dt>
              <dd className="font-bold">{match.breakdown![k]}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-wrap gap-2">
        {match.postings.filter((p) => /^https?:\/\//i.test(p.url)).map((p) => (
          <div key={p.url} className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-2">
              <a href={p.url} target="_blank" rel="noopener" data-testid="match-open" className="brutal brutal-press px-3 py-1.5 text-sm font-semibold">
                {t('open', { source: sourceInfo(p.sourceId)?.name ?? p.sourceId })} ↗
              </a>
              {sourceInfo(p.sourceId)?.applyPaywall && (
                <span data-testid="paid-apply" className="font-mono text-xs text-warning">{t('paidApply')}</span>
              )}
            </span>
            {sourceInfo(p.sourceId)?.applyPaywall && (
              <p data-testid="paid-apply-hint" className="max-w-sm text-xs text-muted-foreground">{t('paidApplyHint')}</p>
            )}
          </div>
        ))}
      </div>
      {onAction && <MatchActions onAction={onAction} />}
      <PeopleSearch company={match.company} isPlaceholder={match.companyIsPlaceholder} />
      <ApplyKitToggle key={match.id} jobId={match.jobId} onApplied={onApplied} />
      {showDescription && match.description && (
        <div className="max-h-[50vh] overflow-y-auto whitespace-pre-line border-t border-border pt-3 text-sm">{match.description}</div>
      )}
    </article>
  );
}
