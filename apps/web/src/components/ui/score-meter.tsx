/** Match score as an Activity-style ring with the number beside it; the label is spoken, the ring is decorative. */
export function ScoreMeter({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone = score >= 80 ? 'var(--success)' : score >= 60 ? 'var(--warning)' : 'var(--muted-foreground)';
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <span data-testid="match-score" className="inline-flex items-center gap-1.5 text-sm" aria-label={`${score}% ${label}`}>
      <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
        <circle cx="9" cy="9" r={r} fill="none" stroke="var(--muted)" strokeWidth="2.5" />
        <circle cx="9" cy="9" r={r} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${(clamped / 100) * c} ${c}`} />
      </svg>
      <span>
        <span className="tabular-nums font-semibold text-foreground">{score}%</span> <span className="text-muted-foreground">{label}</span>
      </span>
    </span>
  );
}
