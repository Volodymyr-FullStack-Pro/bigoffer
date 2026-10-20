/**
 * One button scale for the job panels: 32px pills with 13px text, and a 36px one for the main action. Kept as class
 * strings so they work on <button> and <a> alike.
 */
const base = 'brutal-press inline-flex items-center justify-center gap-1.5 rounded-[10px] font-medium transition-colors disabled:opacity-50';
const sm = `${base} h-8 px-3.5 text-[13px]`;

export const pill = {
  /** White: the action that runs AI or confirms. */
  primary: `${sm} bg-foreground text-background hover:bg-foreground/90`,
  /** Mint: the next step (copy, applied). */
  accent: `${sm} bg-brand text-brand-foreground hover:bg-brand/90`,
  /** Outline: secondary actions. */
  quiet: `${sm} border border-border font-medium hover:bg-muted`,
  /** The panel's main call to action. */
  main: `${base} h-9 px-4 text-sm font-bold bg-brand text-brand-foreground shadow-[0_0_20px_rgb(115_247_178/0.22)]`,
} as const;
