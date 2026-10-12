'use client';

import { defaultSources, MAIN_SOURCE_IDS, ROLE_FAMILIES, type RoleFamily, SEARCH_REMOTE_TYPES, SENIORITIES, SOURCE_CATALOG, type SourceInfo } from '@jp/core';
import { useTranslations } from 'next-intl';
import { Lightbulb } from 'lucide-react';
import { type ReactNode, useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { TagInput } from '@/components/ui/tag-input';
import { tellGenie } from '@/lib/genie/events';
import { cn } from '@/lib/utils';
import { deleteSearchProfile, saveSearchProfile, type SearchFormState } from './actions';
import { profileTips } from './profile-tips';
import { EXCLUDE_SUGGESTIONS, keywordSuggestions, LOCATION_SUGGESTIONS, profileNameSuggestion, recommendedKeywords, SALARY_STEPS, skillSuggestions } from './suggestions';

export type SearchProfileValues = {
  id?: string;
  name: string;
  keywords: string[];
  targetRoles: string[];
  skills: string[];
  excludeKeywords: string[];
  seniority: string[];
  locations: string[];
  remoteType: string;
  sources: string[];
  salaryMinUsd: number | null;
  isActive: boolean;
};

const MARKETS = ['main', 'ua', 'remote', 'europe', 'global'] as const;
const MAIN = new Set<string>(MAIN_SOURCE_IDS);
const field = 'rounded-xl border border-border bg-card px-3 py-2.5 outline-none focus:ring-2 focus:ring-brand';

/** A checkbox drawn as a pill; the (transparent) input covers the pill, so it stays clickable and labelled. */
function Pill({ name, value, label, checked, defaultChecked, onChange, testId, note, noteTestId, describedBy }: {
  name: string;
  value: string;
  label: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (on: boolean) => void;
  testId?: string;
  note?: string;
  noteTestId?: string;
  describedBy?: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm transition-colors hover:border-muted-foreground has-checked:border-brand has-checked:bg-brand has-checked:text-brand-foreground has-focus-visible:ring-2 has-focus-visible:ring-brand">
      <input
        type="checkbox"
        name={name}
        value={value}
        {...(checked === undefined ? { defaultChecked } : { checked, onChange: (e) => onChange?.(e.target.checked) })}
        data-testid={testId}
        aria-describedby={describedBy}
        className="absolute inset-0 z-10 cursor-pointer opacity-0"
      />
      <span className="pointer-events-none">{label}</span>
      {note && <span data-testid={noteTestId} className="pointer-events-none text-xs opacity-70">({note})</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-border pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="text-lg">{title}</h2>
      {children}
    </section>
  );
}

function sourceNote(s: SourceInfo, t: ReturnType<typeof useTranslations<'search'>>): string | undefined {
  if (s.beta) return t('beta');
  if (s.requiresKey) return t('needsKey');
  if (s.lowYield) return t('lowYield');
  return undefined;
}

export function SearchProfileForm({ values, cvSkills = [], cvHeadline = null }: { values: SearchProfileValues; cvSkills?: string[]; cvHeadline?: string | null }) {
  const t = useTranslations('search');
  const [state, action, pending] = useActionState<SearchFormState, FormData>(saveSearchProfile, { status: 'idle' });
  const invalid = new Set(state.fields ?? []);
  const [roles, setRoles] = useState<RoleFamily[]>(values.targetRoles.filter((r): r is RoleFamily => (ROLE_FAMILIES as readonly string[]).includes(r)));
  const [remoteType, setRemoteType] = useState(values.remoteType);
  const [sources, setSources] = useState(new Set(values.sources));
  const salary = values.salaryMinUsd;
  const [keywords, setKeywords] = useState(values.keywords);
  const [skills, setSkills] = useState(values.skills);
  const [locations, setLocations] = useState(values.locations);
  const [name, setName] = useState(values.name);
  const recommended = useMemo(() => recommendedKeywords(cvHeadline, roles, cvSkills, 6, keywords), [cvHeadline, roles, cvSkills, keywords]);
  const nameSuggestion = profileNameSuggestion(cvHeadline, t(`remote_${(SEARCH_REMOTE_TYPES.find((r) => r === remoteType) ?? 'any') as 'any'}`));
  const tips = useMemo(
    () => profileTips({ keywords, recommended, skills, cvSkills, roles, remoteType, locations, sources }),
    [keywords, recommended, skills, cvSkills, roles, remoteType, locations, sources],
  );
  // The Offer Genie mentions the tips when the user arrives here; cleared when leaving the page.
  useEffect(() => {
    tellGenie(tips.length > 0 ? { type: 'hint', key: 'searchTips', params: { count: tips.length } } : { type: 'clearHint' });
  }, [tips.length]);
  useEffect(() => () => tellGenie({ type: 'clearHint' }), []);
  // Pop-up feedback for every save; a tip follows when the profile could still find more.
  const lastStatus = useRef(state);
  useEffect(() => {
    if (state === lastStatus.current) return;
    lastStatus.current = state;
    if (state.status === 'saved') {
      toast.success(t('saved'));
      if (tips.length > 0) toast(t('tipsToast', { count: tips.length }), { icon: '💡' });
    } else if (state.status === 'invalid') toast.error(t('invalid', { fields: (state.fields ?? []).join(', ') }));
    else if (state.status === 'error') toast.error(t('error'));
  }, [state, tips.length, t]);

  const toggle = <T,>(set: (fn: (prev: T[]) => T[]) => void, v: T, on: boolean) => set((prev) => (on ? [...prev, v] : prev.filter((x) => x !== v)));

  return (
    <div className="brutal flex flex-col gap-4 p-6">
      <form action={action} noValidate className="flex flex-col gap-6">
        {values.id && <input type="hidden" name="id" value={values.id} />}

        {tips.length > 0 && (
          <aside data-testid="profile-tips" className="flex flex-col gap-2 rounded-xl border border-brand/40 bg-brand/[0.07] p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Lightbulb className="size-4 text-link" aria-hidden />
              {t('tipsTitle')}
            </p>
            <ul className="flex flex-col gap-1.5 text-sm">
              {tips.map((tip) => (
                <li key={tip.id} data-testid={`tip-${tip.id}`} className="text-muted-foreground">
                  • {'items' in tip ? t(`tip_${tip.id}`, { items: tip.items.join(', ') }) : t(`tip_${tip.id}`)}
                </li>
              ))}
            </ul>
          </aside>
        )}
        <Section title={t('sectionWhat')}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t('name')}</span>
            <input name="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={invalid.has('name')} className={cn(field, invalid.has('name') && 'border-danger')} />
            <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {t('nameHint')}
              {nameSuggestion && nameSuggestion !== name && (
                <button type="button" data-testid="name-suggestion" onClick={() => setName(nameSuggestion)} className="rounded-full border border-brand/60 bg-brand/15 px-2.5 py-0.5 font-medium text-link hover:bg-brand/25">
                  ★ {nameSuggestion}
                </button>
              )}
            </span>
          </label>
          <fieldset className="flex flex-col gap-2" data-testid="target-roles">
            <legend className="mb-1.5 text-xs text-muted-foreground">{t('targetRoles')}</legend>
            <div className="flex flex-wrap gap-2">
              {ROLE_FAMILIES.map((role) => (
                <Pill key={role} name="targetRoles" value={role} label={t(`role_${role}`)} checked={roles.includes(role)} onChange={(on) => toggle(setRoles, role, on)} testId={`role-${role}`} />
              ))}
            </div>
            <span className="text-xs text-muted-foreground">{t('targetRolesHint')}</span>
          </fieldset>
          <TagInput
            name="keywords"
            label={t('keywords')}
            hint={t('keywordsHint')}
            defaultValue={values.keywords}
            suggestions={keywordSuggestions(roles)}
            suggestionsLabel={t('suggested')}
            recommended={recommended}
            recommendedLabel={t('recommended')}
            onChange={setKeywords}
            max={10}
            invalid={invalid.has('keywords')}
            placeholder={t('keywordsPlaceholder')}
          />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-xs text-muted-foreground">{t('seniority')}</legend>
            <div className="flex flex-wrap gap-2">
              {SENIORITIES.map((level) => (
                <Pill key={level} name="seniority" value={level} label={t(`level_${level}`)} defaultChecked={values.seniority.includes(level)} />
              ))}
            </div>
          </fieldset>
        </Section>

        <Section title={t('sectionSkills')}>
          <TagInput
            name="skills"
            label={t('skills')}
            hint={t('skillsHint')}
            defaultValue={values.skills}
            onChange={setSkills}
            suggestions={skillSuggestions(roles, cvSkills)}
            suggestionsLabel={cvSkills.length > 0 ? t('suggestedFromCv') : t('suggested')}
            invalid={invalid.has('skills')}
            placeholder={t('skillsPlaceholder')}
          />
          <TagInput
            name="excludeKeywords"
            label={t('exclude')}
            hint={t('excludeHint')}
            defaultValue={values.excludeKeywords}
            suggestions={EXCLUDE_SUGGESTIONS}
            suggestionsLabel={t('suggested')}
            invalid={invalid.has('excludeKeywords')}
          />
        </Section>

        <Section title={t('sectionTerms')}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t('remoteType')}</span>
              <select name="remoteType" value={remoteType} onChange={(e) => setRemoteType(e.target.value)} className={field}>
                {SEARCH_REMOTE_TYPES.map((r) => (
                  <option key={r} value={r}>
                    {t(`remote_${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">{t('salaryMin')}</span>
              <select name="salaryMinUsd" defaultValue={salary === null ? '' : String(salary)} className={field} data-testid="salary-select">
                <option value="">{t('salaryAny')}</option>
                {/* Keep a saved custom amount selectable even if it is not one of the steps. */}
                {salary !== null && !(SALARY_STEPS as readonly number[]).includes(salary) && <option value={salary}>${salary.toLocaleString('en-US')}</option>}
                {SALARY_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {t('salaryFrom', { amount: `$${s.toLocaleString('en-US')}${s === 8000 ? '+' : ''}` })}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {remoteType !== 'remote' && (
            <TagInput
              name="locations"
              onChange={setLocations}
              label={t('locations')}
              defaultValue={values.locations}
              suggestions={LOCATION_SUGGESTIONS}
              suggestionsLabel={t('suggested')}
              max={10}
              invalid={invalid.has('locations')}
            />
          )}
        </Section>

        <Section title={t('sources')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t('sourcesHint')}</p>
            <button
              type="button"
              data-testid="sources-recommended"
              onClick={() => setSources(new Set(defaultSources((SEARCH_REMOTE_TYPES.find((r) => r === remoteType) ?? 'any') as 'any')))}
              className="rounded-full px-3 py-1 text-sm text-link hover:bg-muted"
            >
              {t('sourcesRecommended')}
            </button>
          </div>
          {MARKETS.map((market) => (
            <fieldset key={market} className="flex flex-col gap-2">
              <legend className="mb-1.5 text-sm font-medium">{t(`market_${market}`)}</legend>
              <div className="flex flex-wrap gap-2">
                {(market === 'main'
                  ? MAIN_SOURCE_IDS.map((id) => SOURCE_CATALOG.find((s) => s.id === id)!)
                  : SOURCE_CATALOG.filter((s) => s.market === market && !MAIN.has(s.id))
                ).map((s) => (
                  <Pill
                    key={s.id}
                    name="sources"
                    value={s.id}
                    label={s.name}
                    note={sourceNote(s, t)}
                    noteTestId={s.lowYield ? `low-yield-${s.id}` : undefined}
                    checked={sources.has(s.id)}
                    onChange={(on) => setSources((prev) => { const next = new Set(prev); if (on) next.add(s.id); else next.delete(s.id); return next; })}
                    testId={`source-${s.id}`}
                    describedBy={s.id === 'linkedin' ? 'source-linkedin-warning' : undefined}
                  />
                ))}
              </div>
              {market === 'main' && <span id="source-linkedin-warning" className="text-xs text-muted-foreground">{t('linkedinWarning')}</span>}
            </fieldset>
          ))}
          {invalid.has('sources') && <p className="text-sm text-danger">{t('sourcesRequired')}</p>}
        </Section>

        {/* Save stays in reach on a long form: sticks to the bottom of the screen (above the phone nav). */}
        <div className="sticky bottom-16 z-20 -mx-6 flex flex-wrap items-center gap-4 border-t border-border bg-card/95 px-6 py-3 backdrop-blur md:bottom-0">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isActive" defaultChecked={values.isActive} className="size-4" />
            {t('active')}
          </label>
          <Button type="submit" variant="brand" disabled={pending} data-testid="search-save" className="ml-auto">
            {t('save')}
          </Button>
          <p role="status" className="w-full text-sm">
            {state.status === 'saved' && <span className="text-success">{t('saved')}</span>}
            {state.status === 'invalid' && <span className="text-danger">{t('invalid', { fields: [...invalid].join(', ') })}</span>}
            {state.status === 'error' && <span className="text-danger">{t('error')}</span>}
          </p>
        </div>
      </form>
      {values.id && (
        <form action={deleteSearchProfile}>
          <input type="hidden" name="id" value={values.id} />
          <Button type="submit" variant="ghost" data-testid="search-delete" className="text-danger">
            {t('delete')}
          </Button>
        </form>
      )}
    </div>
  );
}
