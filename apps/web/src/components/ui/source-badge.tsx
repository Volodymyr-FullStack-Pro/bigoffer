import { sourceInfo } from '@jp/core';

/** Per-board accent (the dot); the pill itself stays neutral so text contrast never depends on the hue. */
const SOURCE_COLORS: Record<string, string> = {
  dou: '#f97316',
  djinni: '#22c55e',
  robotaua: '#ef4444',
  workua: '#3b82f6',
  itlead: '#eab308',
  jobico: '#14b8a6',
  olx: '#06b6d4',
  telegram: '#38bdf8',
  linkedin: '#0a66c2',
  jooble: '#a855f7',
  adzuna: '#10b981',
  remoteok: '#f43f5e',
  remotive: '#8b5cf6',
  himalayas: '#6366f1',
  wwr: '#facc15',
  jobicy: '#84cc16',
  workingnomads: '#0ea5e9',
  hn: '#ff6600',
  arbeitnow: '#64748b',
  justjoin: '#ec4899',
  greenhouse: '#16a34a',
  lever: '#94a3b8',
  ashby: '#c084fc',
  workable: '#2dd4bf',
};

export function SourceBadge({ sourceId }: { sourceId: string }) {
  return (
    <span
      data-testid="source-badge"
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] leading-none text-muted-foreground"
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[sourceId] ?? 'currentColor' }} />
      {sourceInfo(sourceId)?.name ?? sourceId}
    </span>
  );
}
