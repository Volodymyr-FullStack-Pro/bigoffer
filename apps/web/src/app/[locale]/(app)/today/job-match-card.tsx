import { sourceInfo } from '@jp/core';
import { getFormatter, getTranslations } from 'next-intl/server';
import { setMatchState } from './actions';

export type JobMatchView = {
  id: string;
  score: number;
  title: string;
  company: string;
  location: string | null;
  remoteType: 'remote' | 'hybrid' | 'office' | 'unknown';
  salaryMinUsd: number | null;
  salaryMaxUsd: number | null;
  seenAt: string;
  summary: string | null;
  why: string | null;
  seniority: 'intern' | 'junior' | 'middle' | 'senior' | 'lead' | null;
  skills: { name: string; matched: boolean }[];
  postings: { sourceId: string; url: string }[];
};

export async function JobMatchCard({ match }: { match: JobMatchView }) {
  const t = await getTranslations('today');
  const format = await getFormatter();
  const salary =
    match.salaryMinUsd && match.salaryMaxUsd && match.salaryMinUsd !== match.salaryMaxUsd
      ? t('salary', { min: match.salaryMinUsd, max: match.salaryMaxUsd })
      : match.salaryMinUsd
        ? t('salaryFrom', { min: match.salaryMinUsd })
        : match.salaryMaxUsd
          ? t('salaryTo', { max: match.salaryMaxUsd })
          : null;
  const scoreTone =
    match.score >= 80
      ? 'bg-brand text-brand-foreground'
      : match.score >= 60
        ? 'bg-card'
        : 'bg-muted';

  return (
    <article data-testid="job-match" className="brutal flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold leading-tight">{match.title}</h2>
          <p className="text-muted-foreground">{match.company}</p>
        </div>
        <span
          data-testid="match-score"
          className={`shrink-0 rounded-sm border-2 border-border px-2 py-1 font-mono text-sm font-bold ${scoreTone}`}
        >
          {match.score}% {t('match')}
        </span>
      </div>
      {match.summary && (
        <p data-testid="match-summary" className="text-sm">
          {match.summary}
        </p>
      )}
      {match.why && (
        <p data-testid="match-why" className="border-l-4 border-brand pl-3 text-sm">
          <span className="font-semibold">{t('why')}: </span>
          {match.why}
        </p>
      )}
      {match.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {match.skills.map((s) => (
            <li
              key={s.name}
              data-testid="match-skill"
              data-matched={s.matched}
              className={`rounded-sm border-2 border-border px-1.5 py-0.5 font-mono text-xs ${s.matched ? 'bg-brand text-brand-foreground' : ''}`}
            >
              {s.name}
            </li>
          ))}
        </ul>
      )}
      <p className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs uppercase text-muted-foreground">
        <span>{t(`remote_${match.remoteType}`)}</span>
        {match.seniority && <span>{t(`seniority_${match.seniority}`)}</span>}
        {match.location && <span>{match.location}</span>}
        {salary && <span>{salary}</span>}
        <span>{format.relativeTime(new Date(match.seenAt))}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {match.postings
          .filter((p) => /^https?:\/\//i.test(p.url))
          .map((p) => (
            <a
              key={p.url}
              href={p.url}
              target="_blank"
              rel="noopener"
              className="brutal brutal-press px-3 py-1.5 text-sm font-semibold"
            >
              {t('open', { source: sourceInfo(p.sourceId)?.name ?? p.sourceId })} ↗
            </a>
          ))}
        <form action={setMatchState} className="ml-auto">
          <input type="hidden" name="matchId" value={match.id} />
          <input type="hidden" name="state" value="hidden" />
          <button
            type="submit"
            data-testid="match-hide"
            className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            {t('hide')}
          </button>
        </form>
      </div>
    </article>
  );
}
