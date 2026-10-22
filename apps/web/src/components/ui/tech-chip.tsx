import { cn } from '@/lib/utils';

/**
 * A technology the job asks for. One quiet style for all of them — a rainbow of brand colours fought the mint — and
 * mint for the ones the user has (`check`), so what matters is the only colour in the row.
 */
export function TechChip({ name, dim = false, check = false, className }: { name: string; dim?: boolean; check?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold',
        check ? 'border-brand/50 bg-brand/15 text-foreground' : 'border-border bg-muted/60 text-foreground/85',
        dim && 'opacity-60',
        className,
      )}
    >
      {check && <span aria-hidden className="mr-1 text-success">✓</span>}
      {name}
    </span>
  );
}

/** Level hues from the one palette: junior mint, middle sky, senior violet, lead amber. */
const LEVEL: Record<string, string> = {
  intern: 'var(--brand)',
  junior: 'var(--brand)',
  middle: 'var(--status-move)',
  senior: 'var(--status-test)',
  lead: 'var(--status-wait)',
};

export function LevelBadge({ level, label }: { level: string; label: string }) {
  const c = LEVEL[level] ?? 'var(--status-neutral)';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold text-foreground"
      style={{ borderColor: `color-mix(in srgb, ${c} 45%, transparent)`, backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: c }} />
      {label}
    </span>
  );
}
