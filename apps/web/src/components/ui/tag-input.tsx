'use client';

import { X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Chips input: type and press Enter (or a comma), click a suggestion, or paste a comma list. The form receives the
 * chips (plus any text still being typed) as one comma-separated field named `name`, so server actions stay unchanged.
 * Text is not turned into a chip on blur: that reflows the suggestions under the field and would move a Save button
 * out from under the click that caused the blur.
 */
export function TagInput({
  name,
  label,
  hint,
  defaultValue,
  suggestions = [],
  suggestionsLabel,
  max = 30,
  invalid = false,
  placeholder,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  defaultValue: string[];
  suggestions?: string[];
  suggestionsLabel?: string;
  max?: number;
  invalid?: boolean;
  placeholder?: string;
  onChange?: (tags: string[]) => void;
}) {
  const id = useId();
  const [tags, setTags] = useState(defaultValue);
  const [text, setText] = useState('');
  const [showAll, setShowAll] = useState(false);

  const update = (next: string[]) => {
    setTags(next);
    onChange?.(next);
  };
  const add = (raw: string[]) => {
    const next = [...tags];
    for (const part of raw) {
      const v = part.trim();
      if (v && next.length < max && !next.some((t) => norm(t) === norm(v))) next.push(v);
    }
    if (next.length !== tags.length) update(next);
  };

  const open = useMemo(() => {
    const taken = new Set(tags.map(norm));
    const q = norm(text);
    return suggestions.filter((s) => !taken.has(norm(s)) && (!q || norm(s).includes(q)));
  }, [suggestions, tags, text]);
  const shown = showAll || text ? open : open.slice(0, 12);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <input type="hidden" name={name} value={[...tags, text.trim()].filter(Boolean).join(', ')} />
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border bg-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-brand',
          invalid ? 'border-danger' : 'border-border',
        )}
      >
        {tags.map((t) => (
          <span key={t} data-testid="tag-chip" className="inline-flex items-center gap-1 rounded-full bg-brand/15 py-0.5 pr-1 pl-2.5 text-sm text-link">
            {t}
            <button type="button" aria-label={`× ${t}`} onClick={() => update(tags.filter((x) => x !== t))} className="grid size-5 place-items-center rounded-full hover:bg-brand/20">
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          aria-invalid={invalid}
          placeholder={tags.length === 0 ? placeholder : undefined}
          onChange={(e) => {
            const v = e.target.value;
            // A typed or pasted comma (or newline) turns everything before it into chips.
            if (/[,\n]/.test(v)) {
              const parts = v.split(/[,\n]/);
              setText(parts.pop() ?? '');
              add(parts);
            } else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add([text]);
              setText('');
            } else if (e.key === 'Backspace' && !text && tags.length > 0) update(tags.slice(0, -1));
          }}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 outline-none"
        />
      </div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {shown.length > 0 && tags.length < max && (
        <div className="flex flex-wrap items-center gap-1.5" data-testid={`suggest-${name}`}>
          {suggestionsLabel && <span className="mr-1 text-xs text-muted-foreground">{suggestionsLabel}</span>}
          {shown.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                add([s]);
                setText('');
              }}
              className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-link"
            >
              + {s}
            </button>
          ))}
          {!showAll && !text && open.length > shown.length && (
            <button type="button" onClick={() => setShowAll(true)} className="px-1 text-sm text-link">
              +{open.length - shown.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
