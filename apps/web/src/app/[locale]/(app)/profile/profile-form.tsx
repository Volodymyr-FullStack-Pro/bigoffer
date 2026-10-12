'use client';

import type { Contacts } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { updateProfile, type ProfileState } from './actions';

type Props = {
  fullName: string;
  timezone: string;
  contacts: Contacts;
  country: string;
  countries: { code: string; name: string }[];
  timeZones: string[];
};

const CONTACT_FIELDS = [
  { key: 'email', type: 'email' },
  { key: 'phone', type: 'tel' },
  { key: 'linkedin', type: 'url' },
  { key: 'github', type: 'url' },
  { key: 'cv', type: 'url' },
  { key: 'portfolio', type: 'url' },
  { key: 'telegram', type: 'text' },
] as const;

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  invalid,
  list,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  invalid: boolean;
  list?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-xs">{label}</span>
      <input
        name={name}
        type={type}
        list={list}
        defaultValue={defaultValue}
        aria-invalid={invalid}
        className={`brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand ${invalid ? 'border-danger' : ''}`}
      />
    </label>
  );
}

export function ProfileForm({ fullName, timezone, contacts, country, countries, timeZones }: Props) {
  const t = useTranslations('profile');
  const [state, action, pending] = useActionState<ProfileState, FormData>(updateProfile, {
    status: 'idle',
  });
  const invalid = new Set(state.fields ?? []);
  const v = state.values;
  // Remount after every submit so the uncontrolled fields show what was submitted/saved, not the stale initial props.
  const formKey = state.rev ?? 0;

  return (
    <form key={formKey} action={action} noValidate className="flex max-w-2xl flex-col gap-6">
      <div className="brutal grid gap-4 p-5 md:grid-cols-2">
        <Field name="full_name" label={t('fullName')} defaultValue={v?.full_name ?? fullName} invalid={invalid.has('full_name')} />
        <Field name="timezone" label={t('timezone')} defaultValue={v?.timezone ?? timezone} invalid={invalid.has('timezone')} list="timezones" />
        <datalist id="timezones">
          {timeZones.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="profile-country" className="font-mono text-xs">
            {t('country')}
          </label>
          <select
            id="profile-country"
            name="country"
            defaultValue={v?.country ?? country}
            aria-invalid={invalid.has('country')}
            aria-describedby="profile-country-hint"
            className={`brutal bg-card px-3 py-2 outline-none focus:ring-2 focus:ring-brand ${invalid.has('country') ? 'border-danger' : ''}`}
          >
            <option value="">{t('countryNone')}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p id="profile-country-hint" className="text-xs text-muted-foreground">
            {t('countryHint')}
          </p>
        </div>
      </div>

      {/* A heading inside the card (a <legend> would sit on the card's border). */}
      <div role="group" aria-labelledby="contacts-title" className="brutal grid gap-4 p-5 md:grid-cols-2">
        <h2 id="contacts-title" className="text-lg md:col-span-2">{t('contacts')}</h2>
        {CONTACT_FIELDS.map(({ key, type }) => (
          <Field
            key={key}
            name={`contacts.${key}`}
            type={type}
            label={t(key)}
            defaultValue={v ? v.contacts[key] : contacts[key]}
            invalid={invalid.has(`contacts.${key}`)}
          />
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" variant="brand" disabled={pending} data-testid="profile-save">
          {t('save')}
        </Button>
        <p role="status" className="text-sm">
          {state.status === 'saved' && <span className="text-success">{t('saved')}</span>}
          {state.status === 'invalid' && (
            <span className="text-danger">{t('invalid', { fields: [...invalid].join(', ') })}</span>
          )}
          {state.status === 'error' && <span className="text-danger">{t('error')}</span>}
        </p>
      </div>
    </form>
  );
}
