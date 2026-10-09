/** Segmented match meter (10 segments) with the numeric score; the label is spoken, segments are decorative. */
export function ScoreMeter({ score, label }: { score: number; label: string }) {
  const lit = Math.round(score / 10);
  const tone = score >= 80 ? 'bg-brand' : score >= 60 ? 'bg-warning' : 'bg-muted-foreground';
  return (
    <span data-testid="match-score" className="inline-flex items-center gap-2 font-mono text-sm" aria-label={`${score}% ${label}`}>
      <span aria-hidden className="flex gap-[3px]">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={`h-3 w-1 rounded-[1px] ${i < lit ? tone : 'bg-muted'}`} />
        ))}
      </span>
      <span>
        <span className="text-base font-bold text-foreground">{score}%</span> <span className="text-muted-foreground">{label}</span>
      </span>
    </span>
  );
}
