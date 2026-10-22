'use client';

import { ENGLISH_LEVELS, type EnglishLevel, SENIORITIES, type Seniority } from '@jp/core';
import { CircleHelp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { TagInput } from '@/components/ui/tag-input';
import { skillKey } from '../today/card-skills';
import { type CvFacts, saveCvFacts } from './cv-actions';

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1 text-sm font-medium transition-colors ${on ? 'border-brand bg-brand text-brand-foreground' : 'border-border hover:bg-muted'}`;

function Row({ label, missing, hint, children }: { label: string; missing?: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-border py-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-6">
      <span className="pt-1 text-sm font-semibold text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-col gap-2">
        {children}
        {missing && hint && (
          <p className="flex items-center gap-1.5 text-xs text-warning">
            <CircleHelp aria-hidden className="size-3.5" />
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * "Here's what we understood from your CV": the five facts every job is checked against, each fixable in place. A gap
 * (no level, no English) is asked about instead of guessed.
 */
export function CvFactsReview({ initial }: { initial: CvFacts }) {
  const t = useTranslations('cvFacts');
  const tLevel = useTranslations('today');
  const [facts, setFacts] = useState<CvFacts>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const set = (patch: Partial<CvFacts>) => {
    setFacts((f) => ({ ...f, ...patch }));
    setStatus('idle');
  };
  const filled = [facts.headline, facts.seniority, facts.yearsExperience, facts.english, facts.skills.length > 0 ? 1 : null].filter((v) => v !== null && v !== '').length;
  const save = async () => {
    setStatus('saving');
    setStatus((await saveCvFacts(facts).catch(() => false)) ? 'saved' : 'error');
  };
  return (
    <section data-testid="cv-facts" className="brutal flex flex-col p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3">
        <h3 className="font-display text-xl font-bold">{t('title')}</h3>
        <span data-testid="cv-facts-filled" className="text-sm tabular-nums text-muted-foreground">{t('filled', { filled, total: 5 })}</span>
      </div>
      <p className="pb-2 text-sm text-muted-foreground">{t('intro')}</p>
      <Row label={t('role')}>
        <input
          data-testid="cv-facts-role"
          value={facts.headline}
          maxLength={120}
          onChange={(e) => set({ headline: e.target.value })}
          className="rounded-xl border border-border bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand"
        />
      </Row>
      <Row label={t('level')} missing={facts.seniority === null} hint={t('levelMissing')}>
        <span className="flex flex-wrap gap-1.5">
          {SENIORITIES.map((s: Seniority) => (
            <button key={s} type="button" data-testid="cv-facts-level" aria-pressed={facts.seniority === s} onClick={() => set({ seniority: facts.seniority === s ? null : s })} className={chip(facts.seniority === s)}>
              {tLevel(`seniority_${s}`)}
            </button>
          ))}
        </span>
      </Row>
      <Row label={t('years')} missing={facts.yearsExperience === null} hint={t('yearsMissing')}>
        <span className="flex items-center gap-2">
          <input
            data-testid="cv-facts-years"
            type="number"
            min={0}
            max={50}
            step={0.5}
            value={facts.yearsExperience ?? ''}
            onChange={(e) => set({ yearsExperience: e.target.value === '' ? null : Math.min(50, Math.max(0, Number(e.target.value))) })}
            className="w-24 rounded-xl border border-border bg-card px-3 py-2 tabular-nums outline-none focus:ring-2 focus:ring-brand"
          />
          <span className="text-sm text-muted-foreground">{t('yearsUnit')}</span>
        </span>
      </Row>
      <Row label={t('english')} missing={facts.english === null} hint={t('englishMissing')}>
        <span className="flex flex-wrap gap-1.5">
          {ENGLISH_LEVELS.map((l: EnglishLevel) => (
            <button key={l} type="button" data-testid="cv-facts-english" aria-pressed={facts.english === l} onClick={() => set({ english: facts.english === l ? null : l })} className={chip(facts.english === l)}>
              {l}
            </button>
          ))}
        </span>
      </Row>
      <Row label={t('skills', { count: facts.skills.length })}>
        <TagInput name="cv-skills" label={t('skillsAdd')} defaultValue={initial.skills} max={100} sameKey={skillKey} onChange={(skills) => set({ skills })} />
      </Row>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <button type="button" data-testid="cv-facts-save" disabled={status === 'saving'} onClick={() => void save()} className="btn brutal-press bg-brand px-4 py-2 font-semibold text-brand-foreground disabled:opacity-50">
          {t('save')}
        </button>
        <span role="status" data-testid="cv-facts-status" className="text-sm">
          {status === 'saved' && <span className="text-success">✓ {t('saved')}</span>}
          {status === 'error' && <span className="text-danger">{t('error')}</span>}
        </span>
      </div>
    </section>
  );
}
