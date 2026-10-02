'use client';

import { SEARCH_REMOTE_TYPES, SENIORITIES } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteSearchProfile, saveSearchProfile, type SearchFormState } from './actions';

export type SearchProfileValues = {
  id?: string;
  name: string;
  keywords: string[];
  skills: string[];
  excludeKeywords: string[];
  seniority: string[];
  locations: string[];
  remoteType: string;
  salaryMinUsd: number | null;
  isActive: boolean;
};

const input = 'brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand';

function TextField({ name, label, hint, defaultValue, invalid }: { name: string; label: string; hint?: string; defaultValue: string; invalid: boolean }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs uppercase">{label}</span>
      <input name={name} defaultValue={defaultValue} aria-invalid={invalid} className={`${input} ${invalid ? 'border-danger' : ''}`} />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function SearchProfileForm({ values }: { values: SearchProfileValues }) {
  const t = useTranslations('search');
  const [state, action, pending] = useActionState<SearchFormState, FormData>(saveSearchProfile, { status: 'idle' });
  const invalid = new Set(state.fields ?? []);

  return (
    <div className="brutal flex flex-col gap-4 p-5">
      <form action={action} noValidate className="flex flex-col gap-4">
        {values.id && <input type="hidden" name="id" value={values.id} />}
        <TextField name="name" label={t('name')} defaultValue={values.name} invalid={invalid.has('name')} />
        <TextField name="keywords" label={t('keywords')} hint={t('keywordsHint')} defaultValue={values.keywords.join(', ')} invalid={invalid.has('keywords')} />
        <TextField name="skills" label={t('skills')} hint={t('skillsHint')} defaultValue={values.skills.join(', ')} invalid={invalid.has('skills')} />
        <TextField name="excludeKeywords" label={t('exclude')} hint={t('excludeHint')} defaultValue={values.excludeKeywords.join(', ')} invalid={invalid.has('excludeKeywords')} />

        <fieldset className="flex flex-wrap gap-3">
          <legend className="mb-1 font-mono text-xs uppercase">{t('seniority')}</legend>
          {SENIORITIES.map((level) => (
            <label key={level} className="flex items-center gap-2">
              <input type="checkbox" name="seniority" value={level} defaultChecked={values.seniority.includes(level)} />
              {t(`level_${level}`)}
            </label>
          ))}
        </fieldset>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase">{t('remoteType')}</span>
            <select name="remoteType" defaultValue={values.remoteType} className={input}>
              {SEARCH_REMOTE_TYPES.map((r) => (
                <option key={r} value={r}>
                  {t(`remote_${r}`)}
                </option>
              ))}
            </select>
          </label>
          <TextField name="locations" label={t('locations')} defaultValue={values.locations.join(', ')} invalid={invalid.has('locations')} />
          <label className="flex flex-col gap-1">
            <span className="font-mono text-xs uppercase">{t('salaryMin')}</span>
            <input name="salaryMinUsd" type="number" min={0} defaultValue={values.salaryMinUsd ?? ''} className={input} />
          </label>
        </div>

        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={values.isActive} />
          {t('active')}
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" variant="brand" disabled={pending} data-testid="search-save">
            {t('save')}
          </Button>
          <p role="status" className="text-sm">
            {state.status === 'saved' && <span className="text-success">{t('saved')}</span>}
            {state.status === 'invalid' && <span className="text-danger">{t('invalid', { fields: [...invalid].join(', ') })}</span>}
            {state.status === 'error' && <span className="text-danger">{t('error')}</span>}
          </p>
        </div>
      </form>
      {values.id && (
        <form action={deleteSearchProfile}>
          <input type="hidden" name="id" value={values.id} />
          <Button type="submit" variant="ghost" data-testid="search-delete">
            {t('delete')}
          </Button>
        </form>
      )}
    </div>
  );
}
