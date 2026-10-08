/** Segmented match meter (10 segments) with the numeric score; the label is spoken, segments are decorative. */
export function ScoreMeter({ score, label }: { score: number; label: string }) {
  const lit = Math.round(score / 10);
  return (
    <span data-testid="match-score" className="inline-flex items-center gap-2 font-mono text-sm font-bold" aria-label={`${score}% ${label}`}>
      <span aria-hidden className="flex gap-0.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={`h-3 w-1.5 border border-border ${i < lit ? (score >= 80 ? 'bg-brand' : score >= 60 ? 'bg-warning' : 'bg-muted-foreground') : 'bg-transparent'}`}
          />
        ))}
      </span>
      {score}% {label}
    </span>
  );
}
