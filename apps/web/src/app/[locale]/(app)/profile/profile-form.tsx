'use client';

import type { Contacts } from '@jp/core';
import { useTranslations } from 'next-intl';
import { useActionState, useEffect, useRef, useTransition } from 'react';
import { updateProfile, type ProfileState } from './actions';

type Props = {
  fullName: string;
  timezone: string;
  contacts: Contacts;
  country: string;
  countries: { code: string; name: string }[];
  timeZones: string[];
};

// autoComplete lets the browser fill what it already knows; addresses are never spell-checked.
const CONTACT_FIELDS = [
  { key: 'email', type: 'email', autoComplete: 'email' },
  { key: 'phone', type: 'tel', autoComplete: 'tel' },
  { key: 'linkedin', type: 'url', autoComplete: 'url' },
  { key: 'github', type: 'url', autoComplete: 'url' },
  { key: 'cv', type: 'url', autoComplete: 'url' },
  { key: 'portfolio', type: 'url', autoComplete: 'url' },
  { key: 'telegram', type: 'text', autoComplete: 'off' },
] as const;

function Field({
  name,
  label,
  defaultValue,
  type = 'text',
  invalid,
  list,
  autoComplete,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  invalid: boolean;
  list?: string;
  autoComplete?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="tabular-nums text-xs">{label}</span>
      <input
        name={name}
        type={type}
        list={list}
        autoComplete={autoComplete}
        spellCheck={type === 'text' && autoComplete !== 'off' ? undefined : false}
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
  // Saved on its own when a field loses focus or a choice changes. The action is called directly (not as the form's
  // action), so React does not reset the fields after it and what the user typed stays in place.
  const form = useRef<HTMLFormElement>(null);
  const sent = useRef<string | null>(null);
  const [, startTransition] = useTransition();
  const signature = (data: FormData) => JSON.stringify([...data.entries()]);
  useEffect(() => {
    if (form.current) sent.current = signature(new FormData(form.current));
  }, []);
  const save = () => {
    if (!form.current) return;
    const data = new FormData(form.current);
    const sig = signature(data);
    if (sig === sent.current) return;
    sent.current = sig;
    startTransition(() => action(data));
  };

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onBlur={save}
      onChange={(e) => {
        if (e.target instanceof HTMLSelectElement) save();
      }}
      className="flex flex-col gap-6"
    >
      <div className="brutal grid gap-4 p-5 md:grid-cols-2">
        <Field name="full_name" autoComplete="name" label={t('fullName')} defaultValue={fullName} invalid={invalid.has('full_name')} />
        <Field name="timezone" autoComplete="off" label={t('timezone')} defaultValue={timezone} invalid={invalid.has('timezone')} list="timezones" />
        <datalist id="timezones">
          {timeZones.map((tz) => (
            <option key={tz} value={tz} />
          ))}
        </datalist>
        <div className="flex flex-col gap-1 md:col-span-2">
          <label htmlFor="profile-country" className="tabular-nums text-xs">
            {t('country')}
          </label>
          <select
            id="profile-country"
            name="country"
            defaultValue={country}
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
        {CONTACT_FIELDS.map(({ key, type, autoComplete }) => (
          <Field
            key={key}
            name={`contacts.${key}`}
            type={type}
            autoComplete={autoComplete}
            label={t(key)}
            defaultValue={contacts[key]}
            invalid={invalid.has(`contacts.${key}`)}
          />
        ))}
      </div>

      <div className="flex min-h-5 items-center gap-4">
        <p role="status" data-testid="profile-status" className="text-sm">
          {pending && <span className="text-muted-foreground">{t('saving')}</span>}
          {!pending && state.status === 'saved' && <span className="text-success">{t('saved')}</span>}
          {!pending && state.status === 'invalid' && (
            <span className="text-danger">{t('invalid', { fields: [...invalid].join(', ') })}</span>
          )}
          {!pending && state.status === 'error' && <span className="text-danger">{t('error')}</span>}
        </p>
      </div>
    </form>
  );
}
