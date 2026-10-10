'use client';

import { isLocale, type Locale, sourceInfo } from '@jp/core';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';
import { TextGenerateEffect } from '@/components/aceternity/text-generate-effect';
import { ApplyKitPanel } from '@/components/apply-kit/apply-kit-panel';
import { PeopleSearch } from '@/components/apply-kit/people-search';
import { ScoreMeter } from '@/components/ui/score-meter';
import { LevelBadge, TechChip, techColor } from '@/components/ui/tech-chip';
import type { FeedMatch } from './feed-types';

export type MatchAction = 'saved' | 'applied' | 'hide';

export function salaryText(
  t: ReturnType<typeof useTranslations>,
  m: Pick<FeedMatch, 'salaryMinUsd' | 'salaryMaxUsd'>,
) {
  if (m.salaryMinUsd && m.salaryMaxUsd && m.salaryMinUsd !== m.salaryMaxUsd)
    return t('salary', { min: m.salaryMinUsd, max: m.salaryMaxUsd });
  if (m.salaryMinUsd) return t('salaryFrom', { min: m.salaryMinUsd });
  if (m.salaryMaxUsd) return t('salaryTo', { max: m.salaryMaxUsd });
  return null;
}

export function MatchActions({
  onAction,
  compact = false,
}: {
  onAction: (a: MatchAction) => void;
  compact?: boolean;
}) {
  const t = useTranslations('feed');
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'justify-between' : ''}`}>
      <button
        type="button"
        data-testid="match-hide"
        onClick={() => onAction('hide')}
        className="brutal brutal-press px-4 py-2 font-semibold"
      >
        {t('hide')} {!compact && <kbd className="font-mono text-xs opacity-60">H</kbd>}
      </button>
      <button
        type="button"
        data-testid="match-save"
        onClick={() => onAction('saved')}
        className="brutal brutal-press px-4 py-2 font-semibold"
      >
        {t('save')} {!compact && <kbd className="font-mono text-xs opacity-60">S</kbd>}
      </button>
      <button
        type="button"
        data-testid="match-applied"
        onClick={() => onAction('applied')}
        className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground"
      >
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
      <button
        type="button"
        data-testid="apply-kit-open"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="brutal brutal-press self-start px-4 py-2 font-semibold"
      >
        {tk('open')}
      </button>
      {open && (
        <ApplyKitPanel jobId={jobId} locale={locale} hidePeopleSearch onApplied={onApplied} />
      )}
    </div>
  );
}

const PART_MAX = { skills: 35, role: 25, seniority: 15, location: 15, salary: 10 } as const;
type Part = keyof typeof PART_MAX;

/** Which explanation fits a factor's points (keys under feed.why_<part>_<key>). */
function partHint(part: Part, v: number): string {
  if (part === 'skills') return v >= 35 ? 'full' : v > 0 ? 'some' : 'none';
  if (part === 'role') return v >= 25 ? 'match' : v >= 18 ? 'generic' : v > 0 ? 'text' : 'none';
  if (part === 'seniority') return v >= 15 ? 'match' : v > 0 ? 'near' : 'none';
  if (part === 'location') return v >= 15 ? 'match' : v > 0 ? 'partial' : 'none';
  return v >= 10 ? 'ok' : v > 0 ? 'unknown' : 'low';
}

/** The score as five factors: points out of the maximum, a bar, and what it means in words. */
function ScoreBreakdown({
  breakdown,
  matchedCount,
}: {
  breakdown: NonNullable<FeedMatch['breakdown']>;
  matchedCount: number;
}) {
  const tf = useTranslations('feed');
  return (
    <section
      aria-label={tf('breakdown')}
      className="flex flex-col gap-2.5 rounded-2xl bg-muted/50 p-4"
    >
      <h3 className="text-sm font-semibold">{tf('breakdown')}</h3>
      <dl className="grid gap-2.5 sm:grid-cols-2">
        {(Object.keys(PART_MAX) as Part[]).map((part) => {
          const v = breakdown[part];
          const max = PART_MAX[part];
          return (
            <div key={part} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <dt className="font-medium">{tf(`part_${part}`)}</dt>
                <dd className="font-mono text-muted-foreground">
                  {v}/{max}
                </dd>
              </div>
              <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span
                  className={`block h-full rounded-full ${v >= max ? 'bg-success' : v > 0 ? 'bg-warning' : 'bg-muted-foreground/40'}`}
                  style={{ width: `${Math.round((v / max) * 100)}%` }}
                />
              </span>
              <p className="text-xs text-muted-foreground">
                {(tf as (key: string, values?: Record<string, number>) => string)(
                  `why_${part}_${partHint(part, v)}`,
                  { count: matchedCount },
                )}
              </p>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/** "3+ years" from the posting, green when the CV covers it, amber when it asks for more. */
function ExperienceBadge({ required, candidate }: { required: number; candidate: number | null }) {
  const tf = useTranslations('feed');
  const ok = candidate !== null && candidate >= required;
  const tone =
    candidate === null
      ? 'bg-muted text-foreground'
      : ok
        ? 'bg-success/15 text-success'
        : 'bg-warning/15 text-warning';
  return (
    <span
      data-testid="required-years"
      title={candidate === null ? undefined : tf(ok ? 'expOk' : 'expGap', { years: candidate })}
      className={`rounded-full px-2 py-0.5 font-sans font-medium ${tone}`}
    >
      {tf('expRequired', { years: required })}
    </span>
  );
}

function CopyButton({
  text,
  label,
  doneLabel,
  testId,
}: {
  text: string;
  label: string;
  doneLabel: string;
  testId: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          // clipboard blocked: nothing to do
        }
      }}
      className="brutal-press rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
    >
      {done ? `✓ ${doneLabel}` : label}
    </button>
  );
}

export function MatchDetail({
  match,
  onAction,
  onApplied,
  showDescription = true,
}: {
  match: FeedMatch;
  onAction?: (a: MatchAction) => void;
  onApplied?: () => void;
  showDescription?: boolean;
}) {
  const t = useTranslations('today');
  const tf = useTranslations('feed');
  const format = useFormatter();
  const now = useNow();
  const salary = salaryText(t, match);
  const [showMissing, setShowMissing] = useState(false);
  return (
    <article data-testid="match-detail" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <ScoreMeter score={match.score} label={t('match')} />
        <h2 className="font-display text-3xl leading-tight font-extrabold tracking-tight">
          {match.title}
        </h2>
        {match.onBoard !== null && (
          <p
            data-testid="on-board"
            className="self-start rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-medium text-link"
          >
            ✓ {tf('onBoard', { column: match.onBoard || '—' })}
          </p>
        )}
        <p className="text-muted-foreground">{match.company}</p>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-xs text-muted-foreground">
          <span>{t(`remote_${match.remoteType}`)}</span>
          {match.location && <span>{match.location}</span>}
          {match.seniority && (
            <LevelBadge level={match.seniority} label={t(`seniority_${match.seniority}`)} />
          )}
          {salary && <span className="font-bold text-link">{salary}</span>}
          {match.requiredYears !== null && (
            <ExperienceBadge required={match.requiredYears} candidate={match.candidateYears} />
          )}
          <span suppressHydrationWarning>
            {format.relativeTime(new Date(match.postedAt ?? match.firstSeenAt), now)}
          </span>
        </p>
      </div>
      {match.summary && (
        <TextGenerateEffect
          key={`summary-${match.id}`}
          testId="match-summary"
          words={match.summary}
          className="text-[15px] leading-relaxed"
        />
      )}
      {match.why && (
        <p data-testid="match-why" className="border-l-4 border-ai pl-3 text-sm">
          <span className="font-semibold">{t('why')}: </span>
          {match.why}
        </p>
      )}
      {(match.skills.length > 0 || match.missingSkills.length > 0) && (
        <ul className="flex flex-wrap gap-1.5" aria-label={tf('skills')}>
          {match.skills.map((s) => (
            <li key={s.name} data-testid="match-skill" data-matched={s.matched}>
              <TechChip
                name={`${s.matched ? '✓ ' : ''}${s.name}`}
                dim={!s.matched}
                className={
                  techColor(s.name)
                    ? undefined
                    : s.matched
                      ? 'border-brand/40 bg-brand/10 text-link'
                      : 'border-border text-muted-foreground'
                }
              />
            </li>
          ))}
          {showMissing &&
            match.missingSkills.map((name) => (
              <li
                key={`missing-${name}`}
                className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                ✗ {name}
              </li>
            ))}
          {match.missingSkills.length > 0 && (
            <li>
              <button
                type="button"
                data-testid="missing-skills-toggle"
                onClick={() => setShowMissing((v) => !v)}
                className="rounded-full px-2.5 py-0.5 text-xs text-muted-foreground underline hover:text-foreground"
              >
                {showMissing
                  ? tf('missingHide')
                  : tf('missingShow', { count: match.missingSkills.length })}
              </button>
            </li>
          )}
        </ul>
      )}
      {/* Old rows may carry only matchedSkills: no factor points, nothing to explain. */}
      {match.breakdown && typeof match.breakdown.skills === 'number' && (
        <ScoreBreakdown
          breakdown={match.breakdown}
          matchedCount={match.skills.filter((x) => x.matched).length}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {match.postings
          .filter((p) => /^https?:\/\//i.test(p.url))
          .map((p) => (
            <div key={p.url} className="flex flex-col gap-1">
              <span className="inline-flex items-center gap-2">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener"
                  data-testid="match-open"
                  className="brutal brutal-press px-3 py-1.5 text-sm font-semibold"
                >
                  {t('open', { source: sourceInfo(p.sourceId)?.name ?? p.sourceId })} ↗
                </a>
                {sourceInfo(p.sourceId)?.applyPaywall && (
                  <span data-testid="paid-apply" className="font-mono text-xs text-warning">
                    {t('paidApply')}
                  </span>
                )}
              </span>
              {sourceInfo(p.sourceId)?.applyPaywall && (
                <p data-testid="paid-apply-hint" className="max-w-sm text-xs text-muted-foreground">
                  {t('paidApplyHint')}
                </p>
              )}
            </div>
          ))}
      </div>
      {onAction && <MatchActions onAction={onAction} />}
      <PeopleSearch company={match.company} isPlaceholder={match.companyIsPlaceholder} />
      <ApplyKitToggle key={match.id} jobId={match.jobId} onApplied={onApplied} />
      {showDescription && match.description && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{tf('description')}</h3>
            <CopyButton
              text={match.description}
              label={tf('copyDescription')}
              doneLabel={tf('copied')}
              testId="copy-description"
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto whitespace-pre-line text-sm">
            {match.description}
          </div>
        </div>
      )}
    </article>
  );
}
