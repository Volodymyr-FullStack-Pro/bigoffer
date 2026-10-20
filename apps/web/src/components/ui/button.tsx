import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Variant = 'brand' | 'outline' | 'ghost';

const variants: Record<Variant, string> = {
  brand: 'btn brutal-press bg-brand text-brand-foreground',
  outline: 'btn brutal-press border-brand text-link hover:bg-brand/10',
  ghost: 'btn brutal-press border-transparent bg-transparent text-link hover:bg-muted',
};

export function Button({
  variant = 'outline',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn('px-5 py-2 text-[15px] disabled:opacity-50', variants[variant], className)}
      {...props}
    />
  );
}
