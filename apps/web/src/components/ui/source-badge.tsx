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

const SITE_NAMES: [RegExp, string][] = [
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)work\.ua$/, 'Work.ua'],
  [/(^|\.)t\.me$|(^|\.)telegram\.(me|org)$/, 'Telegram'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/(^|\.)(x|twitter)\.com$/, 'X'],
  [/(^|\.)indeed\.com$/, 'Indeed'],
  [/(^|\.)glassdoor\.com$/, 'Glassdoor'],
];

/** The site a card was saved from when it is not one of our boards: "LinkedIn", "Work.ua", else the bare host. */
export function siteName(url: string | null): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
  return SITE_NAMES.find(([re]) => re.test(host))?.[1] ?? host;
}

export function SiteBadge({ url }: { url: string | null }) {
  const name = siteName(url);
  if (!name) return null;
  return (
    <span data-testid="site-badge" className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs leading-5 text-muted-foreground">
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-60" />
      {name}
    </span>
  );
}
