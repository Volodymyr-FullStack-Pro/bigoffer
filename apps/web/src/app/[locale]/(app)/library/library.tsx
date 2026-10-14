'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { deleteLink, previewLinkTitle, saveLink, updateLink } from './actions';
import { type SavedLink, TOPIC_SUGGESTIONS } from './topics';

const field = 'brutal bg-card px-2 py-1.5 text-sm';

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function Library({ initial }: { initial: SavedLink[] }) {
  const t = useTranslations('library');
  const [links, setLinks] = useState(initial);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'title' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of links) counts.set(l.topic, (counts.get(l.topic) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [links]);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = links.filter(
    (l) => (!filter || l.topic === filter) && words.every((w) => `${l.title} ${l.url} ${l.note ?? ''} ${l.topic}`.toLowerCase().includes(w)),
  );

  const fillTitle = async (value: string) => {
    if (!/^https?:\/\//i.test(value.trim()) || title.trim()) return;
    setBusy('title');
    try {
      const found = await previewLinkTitle(value);
      if (found) setTitle((cur) => cur || found);
    } catch {
      // No title: the user types one or the host name is used.
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    try {
      const res = await saveLink({ url, title, topic, note });
      if (!res.ok) return setError(res.error);
      setLinks((list) => [res.link, ...list]);
      setUrl('');
      setTitle('');
      setNote('');
    } catch {
      setError('failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form
        data-testid="link-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="brutal flex flex-col gap-3 p-4"
      >
        <h2 className="font-display text-lg font-semibold">{t('add')}</h2>
        <input
          data-testid="link-url"
          type="url"
          required
          value={url}
          maxLength={1000}
          placeholder="https://…"
          onChange={(e) => setUrl(e.target.value)}
          onBlur={(e) => void fillTitle(e.target.value)}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text');
            setTimeout(() => void fillTitle(pasted), 0);
          }}
          aria-label={t('url')}
          className={field}
        />
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
          <input
            data-testid="link-title"
            value={title}
            maxLength={300}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={busy === 'title' ? t('titleLoading') : t('titleHint')}
            aria-label={t('titleLabel')}
            className={field}
          />
          <input
            data-testid="link-topic"
            list="link-topics"
            value={topic}
            maxLength={40}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t('topicHint')}
            aria-label={t('topic')}
            className={field}
          />
          <datalist id="link-topics">
            {[...new Set([...topics.map(([name]) => name), ...TOPIC_SUGGESTIONS])].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        <textarea data-testid="link-note" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder={t('noteHint')} aria-label={t('note')} className={`${field} min-h-16`} />
        <div className="flex items-center gap-3">
          <button type="submit" data-testid="link-save" disabled={!url.trim() || busy !== null} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">
            {busy === 'save' ? t('saving') : t('save')}
          </button>
          {error && <span data-testid="link-error" role="alert" className="text-sm text-danger">{t(`err_${error}` as never)}</span>}
        </div>
      </form>

      {links.length > 0 && (
        <div className="flex flex-col gap-3">
          <input data-testid="link-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('search')} aria-label={t('search')} className={`${field} max-w-md`} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilter(null)} aria-pressed={filter === null} className={`rounded-full border border-border px-3 py-1 text-sm ${filter === null ? 'bg-foreground text-background' : ''}`}>
              {t('all')} · {links.length}
            </button>
            {topics.map(([name, count]) => (
              <button
                key={name}
                type="button"
                data-testid="link-filter"
                onClick={() => setFilter(filter === name ? null : name)}
                aria-pressed={filter === name}
                className={`rounded-full border border-border px-3 py-1 text-sm ${filter === name ? 'bg-foreground text-background' : ''}`}
              >
                {name} · {count}
              </button>
            ))}
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <p data-testid="library-empty" className="text-muted-foreground">{t('empty')}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((l) =>
            editing === l.id ? (
              <EditLink
                key={l.id}
                link={l}
                onDone={(next) => {
                  if (next) setLinks((list) => list.map((x) => (x.id === l.id ? next : x)));
                  setEditing(null);
                }}
              />
            ) : (
              <li key={l.id} data-testid="link-item" className="brutal flex min-w-0 flex-col gap-1.5 p-4">
                <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-display font-semibold leading-snug underline-offset-2 [overflow-wrap:anywhere] hover:underline">
                  {l.title} ↗
                </a>
                <span className="flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                  <span data-testid="link-topic-chip" className="rounded-full bg-brand/15 px-2 py-0.5 text-link">{l.topic}</span>
                  {host(l.url)}
                </span>
                {l.note && <p className="text-sm whitespace-pre-line text-muted-foreground">{l.note}</p>}
                <span className="mt-1 flex gap-3 text-xs">
                  <button type="button" data-testid="link-edit" onClick={() => setEditing(l.id)} className="underline">{t('edit')}</button>
                  <button
                    type="button"
                    data-testid="link-delete"
                    onClick={async () => {
                      if (!window.confirm(t('deleteConfirm'))) return;
                      if (await deleteLink(l.id).catch(() => false)) setLinks((list) => list.filter((x) => x.id !== l.id));
                    }}
                    className="text-danger underline"
                  >
                    {t('delete')}
                  </button>
                </span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function EditLink({ link, onDone }: { link: SavedLink; onDone: (next: SavedLink | null) => void }) {
  const t = useTranslations('library');
  const [title, setTitle] = useState(link.title);
  const [topic, setTopic] = useState(link.topic);
  const [note, setNote] = useState(link.note ?? '');
  return (
    <li data-testid="link-editing" className="brutal flex flex-col gap-2 p-4">
      <input value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} aria-label={t('titleLabel')} className={field} />
      <input data-testid="link-edit-topic" list="link-topics" value={topic} maxLength={40} onChange={(e) => setTopic(e.target.value)} aria-label={t('topic')} className={field} />
      <textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} aria-label={t('note')} className={`${field} min-h-16`} />
      <span className="flex gap-2">
        <button
          type="button"
          data-testid="link-edit-save"
          onClick={async () => {
            const ok = await updateLink(link.id, { title, topic, note }).catch(() => false);
            onDone(ok ? { ...link, title: title.trim(), topic: topic.replace(/\s+/g, ' ').trim() || 'Other', note: note.trim() || null } : null);
          }}
          className="brutal brutal-press bg-brand px-3 py-1 text-sm font-semibold text-brand-foreground"
        >
          {t('save')}
        </button>
        <button type="button" onClick={() => onDone(null)} className="brutal brutal-press px-3 py-1 text-sm">{t('cancel')}</button>
      </span>
    </li>
  );
}
