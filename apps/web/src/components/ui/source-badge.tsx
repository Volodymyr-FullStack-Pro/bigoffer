import { sourceInfo } from '@jp/core';

/** Per-board dot from the one palette; the pill stays neutral so text contrast never depends on the hue. */
const SOURCE_COLORS: Record<string, string> = {
  dou: 'var(--status-wait)',
  djinni: 'var(--status-move)',
  robotaua: 'var(--status-interview)',
};

export function SourceBadge({ sourceId }: { sourceId: string }) {
  return (
    <span
      data-testid="source-badge"
      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs leading-5 text-muted-foreground"
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: SOURCE_COLORS[sourceId] ?? 'currentColor' }} />
      {sourceInfo(sourceId)?.name ?? sourceId}
    </span>
  );
}
