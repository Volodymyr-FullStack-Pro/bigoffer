import type { ButtonHTMLAttributes } from 'react';

type Variant = 'brand' | 'outline' | 'ghost';

const variants: Record<Variant, string> = {
  brand: 'brutal brutal-press border-brand bg-brand text-brand-foreground hover:brightness-110',
  outline: 'brutal brutal-press bg-card text-foreground',
  ghost: 'border-[1.5px] border-transparent hover:bg-muted rounded-brutal',
};

export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 font-mono text-sm font-semibold disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
