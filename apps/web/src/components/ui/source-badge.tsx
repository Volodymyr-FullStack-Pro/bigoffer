import { sourceInfo } from '@jp/core';

/** Per-board accent (the dot); the pill itself stays neutral so text contrast never depends on the hue. */
const SOURCE_COLORS: Record<string, string> = {
  dou: '#f97316',
  djinni: '#22c55e',
  robotaua: '#ef4444',
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
