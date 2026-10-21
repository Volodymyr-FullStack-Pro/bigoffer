'use client';

import { getJobDescription } from './actions';
import { SourceBadge } from '@/components/ui/source-badge';
import { PayLevelBadge } from './pay-level-badge';
import { pill } from '@/components/ui/pill';
import { isLocale, type Locale, sourceInfo } from '@jp/core';
import { useFormatter, useLocale, useNow, useTranslations } from 'next-intl';
import { Flag, RefreshCw, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { setUrlParam } from '@/lib/use-stored-state';
import { TextGenerateEffect } from '@/components/aceternity/text-generate-effect';
import { ApplyKitPanel } from '@/components/apply-kit/apply-kit-panel';
import { PeopleSearch } from '@/components/apply-kit/people-search';
import { ScoreMeter } from '@/components/ui/score-meter';
import { LevelBadge } from '@/components/ui/tech-chip';
import type { FeedMatch } from './feed-types';
import { DomainBadges } from './domain-badges';
import { HiddenReason } from './hidden-reason';

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

/** Hide / Save / Applied: at the top of the detail, beside the match score, where the eye starts. */
export function MatchActions({
  onAction,
  compact = false,
  className = '',
}: {
  onAction: (a: MatchAction) => void;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations('feed');
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? 'justify-between' : ''} ${className}`} data-testid="match-actions">
      <button
        type="button"
        data-testid="match-hide"
        onClick={() => onAction('hide')}
        className={pill.quiet}
      >
        {t('hide')}
      </button>
      <button
        type="button"
        data-testid="match-save"
        onClick={() => onAction('saved')}
        className={pill.quiet}
      >
        {t('save')}
      </button>
      <button
        type="button"
        data-testid="match-applied"
        onClick={() => onAction('applied')}
        className={pill.accent}
      >
        {t('applied')}
      </button>
    </div>
  );
}

function ApplyKitToggle({ jobId, onApplied, defaultOpen = false }: { jobId: string; onApplied?: () => void; defaultOpen?: boolean }) {
  const tk = useTranslations('kit');
  const rawLocale = useLocale();
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en';
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        data-testid="apply-kit-open"
        aria-expanded={open}
        onClick={() => {
          // Remembered in the URL, so a reload keeps the kit open.
          setUrlParam('kit', open ? null : '1');
          setOpen((v) => !v);
        }}
        className={`${pill.main} self-start`}
      >
        <Sparkles className="size-5" aria-hidden />
        {tk('open')}
        <span aria-hidden className="text-sm opacity-70">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <ApplyKitPanel jobId={jobId} locale={locale} hidePeopleSearch onApplied={onApplied} />
      )}
    </div>
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

// Descriptions already loaded in this tab, so switching back and forth between jobs does not refetch.
const descriptions = new Map<string, string>();

/** The posting's text, fetched when the detail opens (the feed page itself ships without descriptions). */
function JobDescription({ jobId, initial }: { jobId: string; initial: string }) {
  const tf = useTranslations('feed');
  const [text, setText] = useState<string | null>(initial || descriptions.get(jobId) || null);
  useEffect(() => {
    if (text !== null) return;
    let live = true;
    getJobDescription(jobId)
      .then((d) => {
        if (d) descriptions.set(jobId, d);
        if (live) setText(d ?? '');
      })
      .catch(() => live && setText(''));
    return () => {
      live = false;
    };
  }, [jobId, text]);
  if (text === '') return null;
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{tf('description')}</h3>
        {text && <CopyButton text={text} label={tf('copyDescription')} doneLabel={tf('copied')} testId="copy-description" />}
      </div>
      {text === null ? (
        <div data-testid="description-loading" className="flex animate-pulse flex-col gap-2">
          <div className="h-3 w-11/12 rounded bg-muted" />
          <div className="h-3 w-10/12 rounded bg-muted" />
          <div className="h-3 w-9/12 rounded bg-muted" />
        </div>
      ) : (
        // Part of the panel's own scroll (desktop) or the page (phone): no scroll inside a scroll.
        <div data-testid="job-description" className="whitespace-pre-line text-sm">
          {text}
        </div>
      )}
    </div>
  );
}

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** "English C1": green when the CV level meets it, amber when the job asks for more. */
export function EnglishBadge({ required, candidate }: { required: string; candidate: string | null }) {
  const tf = useTranslations('feed');
  const ok = candidate !== null && CEFR.indexOf(candidate) >= CEFR.indexOf(required);
  const tone = candidate === null ? 'bg-muted text-foreground' : ok ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning';
  return (
    <span
      data-testid="required-english"
      data-gap={candidate !== null && !ok ? 'true' : undefined}
      title={candidate === null ? undefined : tf(ok ? 'englishOk' : 'englishGap', { level: candidate })}
      className={`rounded-full px-2 py-0.5 font-sans font-medium ${tone}`}
    >
      {tf('englishRequired', { level: required })}
      {candidate !== null && !ok && <span className="opacity-80"> · {tf('englishYours', { level: candidate })}</span>}
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
      className={pill.quiet}
    >
      {done ? `✓ ${doneLabel}` : label}
    </button>
  );
}

/** What the job asks for, split into what the user has and what they lack; long lists fold. */
function JobTechs({ techs }: { techs: FeedMatch['techs'] }) {
  const tf = useTranslations('feed');
  const [all, setAll] = useState(false);
  if (techs.length === 0) return null;
  const have = techs.filter((x) => x.matched);
  const lack = techs.filter((x) => !x.matched);
  const LIMIT = 10;
  const folded = !all && techs.length > LIMIT + 2;
  const shownLack = folded ? lack.slice(0, Math.max(0, LIMIT - have.length)) : lack;
  const shownHave = folded ? have.slice(0, LIMIT) : have;
  const rest = techs.length - shownHave.length - shownLack.length;
  return (
    <section data-testid="job-techs" aria-label={tf('techsTitle')} className="flex flex-col gap-2.5 rounded-xl border border-border bg-card/50 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{tf('techsTitle')}</h3>
        <span data-testid="job-techs-count" className="tabular-nums text-xs text-muted-foreground">
          {tf('techsCount', { have: have.length, total: techs.length })}
        </span>
      </div>
      {shownHave.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{tf('techsHave')}</span>
          <ul className="flex flex-wrap gap-1.5">
            {shownHave.map((x) => (
              <li key={x.name} data-testid="match-skill" data-matched="true" className="rounded-full border border-success/45 bg-success/10 px-2.5 py-0.5 text-xs font-medium text-success">
                ✓ {x.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {shownLack.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">{tf('techsLack')}</span>
          <ul className="flex flex-wrap gap-1.5">
            {shownLack.map((x) => (
              <li key={x.name} data-testid="match-skill" data-matched="false" className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground">
                {x.name}
              </li>
            ))}
          </ul>
        </div>
      )}
      {(folded || all) && techs.length > LIMIT + 2 && (
        <button type="button" data-testid="job-techs-toggle" onClick={() => setAll((v) => !v)} className="self-start text-xs font-medium text-link underline">
          {all ? tf('techsLess') : tf('techsMore', { count: rest })}
        </button>
      )}
    </section>
  );
}

export function MatchDetail({
  match,
  onAction,
  onApplied,
  showDescription = true,
  kitOpen = false,
}: {
  match: FeedMatch;
  onAction?: (a: MatchAction) => void;
  onApplied?: () => void;
  showDescription?: boolean;
  kitOpen?: boolean;
}) {
  const t = useTranslations('today');
  const tf = useTranslations('feed');
  const format = useFormatter();
  const now = useNow();
  const salary = salaryText(t, match);
  return (
    <article data-testid="match-detail" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <ScoreMeter score={match.score} label={t('match')} />
          {onAction && <MatchActions onAction={onAction} />}
        </div>
        <h2 className="font-display text-3xl leading-tight font-extrabold tracking-tight">
          {match.title}
        </h2>
        {match.excludedBy && <HiddenReason reason={match.excludedBy} />}
        <DomainBadges domains={match.domains} perks={match.perks} detailed />
        {match.onBoard !== null && (
          <p
            data-testid="on-board"
            className="self-start rounded-full bg-success/15 ring-1 ring-inset ring-success/40 px-2.5 py-0.5 text-xs font-semibold text-success"
          >
            ✓ {tf('onBoard', { column: match.onBoard || '—' })}
            {match.onBoardLeft.length > 0 && <> · {tf('onBoardLeft', { platforms: match.onBoardLeft.map((s) => sourceInfo(s)?.name ?? s).join(', ') })}</>}
          </p>
        )}
        {match.refreshedAt && Date.parse(match.refreshedAt) > now.getTime() - 7 * 86_400_000 && (
        <span data-testid="refreshed-badge" className="self-start rounded-full bg-success/15 ring-1 ring-inset ring-success/40 px-2 py-0.5 text-xs font-semibold text-success" suppressHydrationWarning>
          <RefreshCw aria-hidden className="mr-1 inline size-3 -translate-y-px" />
          {tf('refreshed', { ago: format.relativeTime(new Date(match.refreshedAt), now) })}
        </span>
      )}
        {match.onBoard === null && match.companyOnBoard && (
          <p data-testid="company-on-board" className="self-start rounded-full bg-warning/25 ring-1 ring-inset ring-warning/45 px-2.5 py-0.5 text-xs font-semibold text-warning">
            <Flag aria-hidden className="mr-1 inline size-3.5 -translate-y-px" />
            {tf('companyOnBoard', { title: match.companyOnBoard.title, column: match.companyOnBoard.column || '—' })}
            {match.companyOnBoard.sourceId && (
              <span data-testid="company-on-board-source"> · {sourceInfo(match.companyOnBoard.sourceId)?.name ?? match.companyOnBoard.sourceId}</span>
            )}
          </p>
        )}
        {!match.companyIsPlaceholder && <p className="text-muted-foreground">{match.company}</p>}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 tabular-nums text-xs text-muted-foreground">
          {[...new Set(match.postings.map((p) => p.sourceId))].map((id) => (
            <SourceBadge key={id} sourceId={id} />
          ))}
          <span>{t(`remote_${match.remoteType}`)}</span>
          {match.location && match.location.trim().toLowerCase() !== t(`remote_${match.remoteType}`).toLowerCase() && <span>{match.location}</span>}
          {match.seniority && (
            <LevelBadge level={match.seniority} label={t(`seniority_${match.seniority}`)} />
          )}
          {salary && <span className="font-bold text-foreground">{salary}</span>}
          {!salary && match.payLevel && <PayLevelBadge level={match.payLevel} />}
          {match.requiredYears !== null && (
            <ExperienceBadge required={match.requiredYears} candidate={match.candidateYears} />
          )}
          {match.requiredEnglish !== null && <EnglishBadge required={match.requiredEnglish} candidate={match.candidateEnglish} />}
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
      <JobTechs techs={match.techs} />
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
                  className={pill.quiet}
                >
                  {t('open', { source: sourceInfo(p.sourceId)?.name ?? p.sourceId })} ↗
                </a>
              </span>
            </div>
          ))}
      </div>
      <ApplyKitToggle key={match.id} jobId={match.jobId} onApplied={onApplied} defaultOpen={kitOpen} />
      <PeopleSearch jobId={match.jobId} />
      {showDescription && <JobDescription key={match.jobId} jobId={match.jobId} initial={match.description} />}
    </article>
  );
}
