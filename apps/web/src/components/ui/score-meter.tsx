/** Match score as an Activity-style ring with the number beside it; the label is spoken, the ring is decorative. */
export function ScoreMeter({ score, label, compact = false, testId = 'match-score' }: {
  score: number;
  label: string;
  /** Ring and number only (a board card, a reminder row); the label is still spoken. */
  compact?: boolean;
  testId?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--muted-foreground)';
  const size = compact ? 16 : 18;
  const r = compact ? 6 : 7;
  const c = 2 * Math.PI * r;
  return (
    <span data-testid={testId} data-score={score} className={`inline-flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`} aria-label={`${score}% ${label}`} title={compact ? `${score}% ${label}` : undefined}>
      <svg aria-hidden width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth="2.5" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(clamped / 100) * c} ${c}`} />
      </svg>
      <span aria-hidden={compact || undefined}>
        <span className="tabular-nums font-semibold text-foreground">{score}%</span>
        {!compact && <> <span className="text-muted-foreground">{label}</span></>}
      </span>
    </span>
  );
}
