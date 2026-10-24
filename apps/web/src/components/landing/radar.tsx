'use client';

import { sourceInfo } from '@jp/core';
import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { WatchingB } from './watching-b';

export type RadarJob = { title: string; company: string; source: string | null };
export type RadarLabels = { title: string; live: string; toFeed: string; hidden: string[]; match: string; profile: string };

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);

/**
 * How the job reads for the demo profile (a full-stack JavaScript developer, middle): the visitor has none yet. JS jobs
 * at that level score high; another stack, level or role scores low with that reason. Stable per posting.
 */
function demo(title: string): { score: number; reason: 0 | 1 | 2 | null } {
  const h = hash(title);
  const other = /\b(java|php|laravel|\.net|c#|python|django|ruby|golang|go\b|kotlin|swift|flutter|1c)\b/i.test(title) && !/javascript/i.test(title);
  const role = /\b(qa|aqa|devops|sre|designer|ui\/ux|data|analyst|manager|recruiter|sales|support)\b/i.test(title);
  const level = /\b(senior|lead|principal|head|architect|staff)\b/i.test(title);
  const js = /react|node|next|vue|angular|typescript|javascript|front.?end|full.?stack|web/i.test(title);
  if (other) return { score: 30 + (h % 20), reason: 0 };
  if (role) return { score: 25 + (h % 20), reason: 2 };
  if (level) return { score: 55 + (h % 15), reason: 1 };
  if (js) return { score: 82 + (h % 17), reason: null };
  return { score: 45 + (h % 20), reason: 2 };
}

const SHOWN = 6;

/** Used only when the boards' numbers are unavailable, so the radar is never empty. */
const SAMPLE: RadarJob[] = [
  { title: 'Middle Full-Stack Developer (React, Node.js)', company: 'Fintech product', source: 'djinni' },
  { title: 'Senior Java Engineer', company: 'Outsourcing', source: 'dou' },
  { title: 'Frontend Engineer (Next.js)', company: 'SaaS startup', source: 'dou' },
  { title: 'QA Automation Engineer', company: 'Gamedev studio', source: 'robotaua' },
  { title: 'Junior React Developer', company: 'E-commerce', source: 'djinni' },
  { title: 'DevOps Engineer (AWS)', company: 'Product company', source: 'djinni' },
  { title: 'Full Stack TypeScript Engineer', company: 'AI startup', source: 'dou' },
  { title: 'PHP Developer (Laravel)', company: 'Agency', source: 'robotaua' },
];
const STEP_MS = 1400;

/**
 * The landing's one moment: real postings from the boards arrive one by one, each gets a match score; strong ones go
 * to the feed and Telegram, the rest dim with the reason they are hidden. The b watches over it. Still and complete
 * for reduced motion.
 */
export function Radar({ jobs, labels, watcher = true }: { jobs: RadarJob[]; labels: RadarLabels; watcher?: boolean }) {
  const list = jobs.length > 0 ? jobs : SAMPLE;
  const [tick, setTick] = useState(SHOWN);
  useEffect(() => {
    if (list.length <= SHOWN || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setTick((t) => t + 1), STEP_MS);
    return () => clearInterval(id);
  }, [list.length]);
  const rows = Array.from({ length: Math.min(SHOWN, list.length) }, (_, i) => {
    const n = tick - i - 1;
    return { job: list[((n % list.length) + list.length) % list.length]!, key: n, fresh: i === 0 && tick > SHOWN };
  });
  return (
    <div className="relative">
      {watcher && <WatchingB className="absolute -top-[5.25rem] left-4 z-10 h-24 w-auto md:-top-[6.25rem] md:h-28" />}
      <div className="brutal relative overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">{labels.title}</span>
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-brand" />
            </span>
            {labels.live}
          </span>
        </div>
        <ul data-testid="landing-radar" aria-live="off" className="flex flex-col">
          {rows.map(({ job, key, fresh }) => {
            const { score, reason } = demo(job.title);
            const strong = reason === null;
            return (
              <li
                key={key}
                className={`grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 ${fresh ? 'radar-in' : ''} ${strong ? '' : 'opacity-55'}`}
              >
                <span
                  className={`grid h-9 place-items-center rounded-lg text-sm font-extrabold tabular-nums ${strong ? 'bg-brand text-brand-foreground' : 'bg-muted text-muted-foreground'}`}
                  aria-label={`${score}% ${labels.match}`}
                >
                  {score}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{job.title}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                    {job.company}
                    {job.source && <> · {sourceInfo(job.source)?.name ?? job.source}</>}
                    <span className="sm:ml-auto">
                      {strong ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-link">
                          <Send aria-hidden className="size-3" /> {labels.toFeed}
                        </span>
                      ) : (
                        labels.hidden[reason ?? 0]
                      )}
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{labels.profile}</p>
      </div>
    </div>
  );
}
