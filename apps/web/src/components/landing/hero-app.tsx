import { BarChart3, BookMarked, Columns3, Flame, GraduationCap, Users } from 'lucide-react';
import { Glyph } from '@/components/brand/logo';
import { ScoreMeter } from '@/components/ui/score-meter';
import { TechChip } from '@/components/ui/tech-chip';

export type HeroAppText = { nav: string[]; title: string; count: string; stats: [string, string][]; match: string; why: string; apply: string };

const ROWS = [
  { score: 96, title: 'Middle Full-Stack Developer', meta: 'Fintech · Remote · $3,500–4,500', skills: ['React', 'Node.js', 'TypeScript'] },
  { score: 91, title: 'Frontend Engineer (Next.js)', meta: 'SaaS · Remote · $3,000–4,000', skills: ['Next.js', 'React'] },
  { score: 84, title: 'Full Stack TypeScript Engineer', meta: 'AI startup · Hybrid, Kyiv', skills: ['TypeScript', 'PostgreSQL'] },
  { score: 77, title: 'React Developer', meta: 'E-commerce · Remote', skills: ['React', 'Redux'] },
];

/** The hero's product shot, drawn live with the app's own pieces: sidebar, Today with its numbers, feed and detail. */
export function HeroApp({ t }: { t: HeroAppText }) {
  const icons = [Flame, Columns3, Users, BarChart3, GraduationCap, BookMarked];
  return (
    <div className="grid h-[26rem] grid-cols-[3.25rem_minmax(0,1fr)] text-left md:h-[34rem] md:grid-cols-[12rem_minmax(0,1fr)]">
      <aside className="flex flex-col gap-1 border-r border-border p-2 md:p-3">
        <svg viewBox="112 124 254 288" aria-hidden className="mb-3 ml-1 h-7 w-auto self-start">
          <Glyph />
        </svg>
        {t.nav.map((label, i) => {
          const I = icons[i]!;
          return (
            <span key={label} className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm ${i === 0 ? 'bg-muted font-semibold' : 'text-muted-foreground'}`}>
              <I aria-hidden className={`size-4 shrink-0 ${i === 0 ? 'text-brand' : ''}`} />
              <span className="hidden md:inline">{label}</span>
            </span>
          );
        })}
      </aside>
      <div className="flex min-w-0 flex-col gap-3 overflow-hidden p-3 md:p-5">
        <p className="font-display text-xl font-bold md:text-2xl">
          {t.title}
          <span className="text-muted-foreground">. {t.count}</span>
        </p>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          {t.stats.map(([v, l], i) => (
            <span key={l} className={`bg-card p-2.5 ${i > 1 ? 'hidden md:block' : ''}`}>
              <span className={`block font-display text-xl font-extrabold tabular-nums ${i === 0 ? 'text-brand' : i === 2 ? 'text-warning' : ''}`}>{v}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{l}</span>
            </span>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <ul className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border">
            {ROWS.map((r, i) => (
              <li key={r.title} className={`relative flex flex-col gap-1 border-b border-border px-3 py-2.5 last:border-b-0 ${i === 0 ? 'bg-muted before:absolute before:inset-y-0 before:left-0 before:w-0.75 before:bg-brand' : ''}`}>
                <ScoreMeter score={r.score} label={t.match} compact />
                <span className="truncate text-sm font-semibold">{r.title}</span>
                <span className="truncate text-xs text-muted-foreground">{r.meta}</span>
              </li>
            ))}
          </ul>
          <div className="hidden min-h-0 flex-col gap-2.5 overflow-hidden rounded-xl border border-border p-4 lg:flex">
            <ScoreMeter score={96} label={t.match} />
            <p className="font-display text-lg leading-tight font-extrabold">{ROWS[0]!.title}</p>
            <p className="text-xs text-muted-foreground">{ROWS[0]!.meta}</p>
            <span className="flex flex-wrap gap-1">
              {ROWS[0]!.skills.map((s) => <TechChip key={s} name={s} check />)}
            </span>
            <p className="border-l-4 border-ai pl-3 text-xs">{t.why}</p>
            <span className="mt-auto self-start rounded-[10px] bg-brand px-3.5 py-1.5 text-[13px] font-semibold text-brand-foreground">{t.apply}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
