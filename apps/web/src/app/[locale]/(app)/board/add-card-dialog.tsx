'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useModalDialog } from './use-modal-dialog';
import { createApplication, previewJob } from './actions';
import type { BoardCard, BoardColumn } from './board-types';

export function AddCardDialog({ columns, onCreated, onClose }: { columns: BoardColumn[]; onCreated: (c: BoardCard) => void; onClose: () => void }) {
  const t = useTranslations('board');
  const [dialogRef, onDialogCancel] = useModalDialog(onClose);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [salary, setSalary] = useState('');
  const [columnId, setColumnId] = useState((columns.find((c) => c.key === 'saved') ?? columns.find((c) => c.kind === 'active'))?.id ?? '');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState(false);
  // Set when the link was read by a board parser: the card links the stored job (apply kit, source badge).
  const [imported, setImported] = useState<{ jobId?: string; sourceId?: string; recruiter?: string | null } | null>(null);
  const field = 'brutal bg-card px-2 py-1 font-sans text-sm';

  const fetchPreview = async (link = url) => {
    setLoading(true);
    setFailed(false);
    setImported(null);
    let p: Awaited<ReturnType<typeof previewJob>> = null;
    try {
      p = await previewJob(link.trim());
    } catch {
      p = null;
    }
    setLoading(false);
    if (!p || !p.title) return setFailed(true);
    setTitle(p.title);
    if (p.company) setCompany(p.company);
    if (p.location) setLocation(p.location);
    if (p.salary) setSalary(p.salary);
    if (p.url) setUrl(p.url);
    if (p.jobId) setImported({ jobId: p.jobId, sourceId: p.sourceId, recruiter: p.recruiter });
  };

  return (
    <dialog ref={dialogRef} onCancel={onDialogCancel} aria-labelledby="add-title-h" data-testid="add-card-dialog" className="m-auto w-full max-w-lg bg-transparent p-4 text-foreground backdrop:bg-black/50">
      <form
        className="brutal flex w-full flex-col gap-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(false);
          let card: BoardCard | null = null;
          try {
            card = await createApplication({
              columnId,
              title,
              company,
              url: url.trim() || null,
              location: location || null,
              salary: salary || null,
              jobId: imported?.jobId ?? null,
              sourceId: imported?.sourceId ?? null,
              contactName: imported?.recruiter ?? null,
            });
          } catch {
            card = null;
          }
          if (!card) return setError(true);
          onCreated(card);
          onClose();
        }}
      >
        <h2 id="add-title-h" className="font-display text-xl font-semibold">{t('addTitle')}</h2>
        <div className="flex gap-2">
          <input
            data-testid="add-url"
            type="url"
            value={url}
            autoFocus
            onChange={(e) => setUrl(e.target.value)}
            // Pasting a link fills the card right away.
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text').trim();
              if (/^https?:\/\//i.test(pasted)) {
                e.preventDefault();
                setUrl(pasted);
                void fetchPreview(pasted);
              }
            }}
            placeholder={t('addUrl')}
            className={`${field} flex-1`}
          />
          <button type="button" data-testid="add-fetch" disabled={!url || loading} onClick={() => void fetchPreview()} className="brutal brutal-press px-3 text-sm font-semibold disabled:opacity-50">
            {loading ? '…' : t('addFetch')}
          </button>
        </div>
        {loading && <p data-testid="add-loading" className="text-sm text-muted-foreground">{t('addLoading')}</p>}
        {imported && <p data-testid="add-imported" className="text-sm text-success">✓ {t('addImported')}</p>}
        {failed && <p data-testid="add-preview-failed" className="text-sm text-warning">{t('addPreviewFailed')}</p>}
        <label className="flex flex-col gap-1 font-mono text-xs">{t('addJobTitle')}<input data-testid="add-title" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs">{t('addCompany')}<input data-testid="add-company" maxLength={200} value={company} onChange={(e) => setCompany(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs">{t('addLocation')}<input maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs">{t('salary')}<input maxLength={120} value={salary} onChange={(e) => setSalary(e.target.value)} className={field} /></label>
        <label className="flex flex-col gap-1 font-mono text-xs">
          {t('moveTo')}
          <select data-testid="add-column" value={columnId} onChange={(e) => setColumnId(e.target.value)} className={field}>
            {columns.filter((c) => c.kind === 'active').map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </label>
        {error && <p role="alert" className="text-sm text-danger">{t('saveError')}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 font-semibold">{t('cancel')}</button>
          <button type="submit" data-testid="add-submit" disabled={!title.trim()} className="brutal brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">{t('addSubmit')}</button>
        </div>
      </form>
    </dialog>
  );
}
