'use client';

import { REJECTION_REASONS, REJECTION_STAGES, type RejectionInput, type RejectionReason, type RejectionStage } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function RejectDialog({ initialReasons = [], onConfirm, onCancel }: {
  initialReasons?: RejectionReason[];
  onConfirm: (input: RejectionInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('board');
  const [stage, setStage] = useState<RejectionStage>('application');
  const [by, setBy] = useState<'company' | 'me'>('company');
  const [reasons, setReasons] = useState<RejectionReason[]>(initialReasons);
  const [note, setNote] = useState('');
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reject-title" data-testid="reject-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        className="brutal flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (reasons.length > 0) onConfirm({ stage, by, reasons, note });
        }}
      >
        <h2 id="reject-title" className="font-display text-xl font-black">{t('rejectTitle')}</h2>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('rejectStage')}
          <select data-testid="reject-stage" value={stage} onChange={(e) => setStage(e.target.value as RejectionStage)} className="brutal bg-card px-2 py-1 font-sans text-sm normal-case">
            {REJECTION_STAGES.map((s) => <option key={s} value={s}>{t(`stage_${s}`)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('rejectBy')}
          <select data-testid="reject-by" value={by} onChange={(e) => setBy(e.target.value as 'company' | 'me')} className="brutal bg-card px-2 py-1 font-sans text-sm normal-case">
            <option value="company">{t('byCompany')}</option>
            <option value="me">{t('byMe')}</option>
          </select>
        </label>
        <fieldset className="flex flex-col gap-1">
          <legend className="font-mono text-xs uppercase">{t('rejectReasons')}</legend>
          <div className="grid grid-cols-2 gap-1">
            {REJECTION_REASONS.map((r) => (
              <label key={r} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="reject-reason"
                  value={r}
                  checked={reasons.includes(r)}
                  onChange={(e) => setReasons((list) => (e.target.checked ? [...list, r] : list.filter((x) => x !== r)))}
                />
                {t(`reason_${r}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex flex-col gap-1 font-mono text-xs uppercase">
          {t('rejectNote')}
          <textarea data-testid="reject-note" value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} className="brutal min-h-20 bg-card px-2 py-1 font-sans text-sm normal-case" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 font-semibold">{t('cancel')}</button>
          <button type="submit" data-testid="reject-confirm" disabled={reasons.length === 0} className="brutal brutal-press bg-danger px-4 py-2 font-semibold text-white disabled:opacity-50">
            {t('rejectConfirm')}
          </button>
        </div>
      </form>
    </div>
  );
}
