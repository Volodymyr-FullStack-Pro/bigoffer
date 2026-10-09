import type { ButtonHTMLAttributes } from 'react';

type Variant = 'brand' | 'outline' | 'ghost';

const variants: Record<Variant, string> = {
  brand: 'brutal-press rounded-full bg-brand text-brand-foreground',
  outline: 'brutal-press rounded-full border border-border bg-card text-foreground hover:bg-muted',
  ghost: 'brutal-press rounded-full text-link hover:bg-muted',
};

export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-5 py-2 text-[15px] font-medium disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
