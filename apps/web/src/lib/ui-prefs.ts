import { JOB_DOMAINS } from '@jp/core';
import { z } from 'zod';

/** Per-user UI choices kept in profiles.ui_prefs so they survive reloads and devices. Unknown/invalid keys are dropped. */
export const uiPrefsSchema = z
  .object({
    feed: z
      .object({
        profileId: z.string().max(64),
        minScore: z.number().int().min(0).max(100),
        remote: z.enum(['any', 'remote', 'hybrid', 'office']),
        source: z.string().max(40),
        fresh: z.boolean(),
        sort: z.enum(['best', 'newest']),
        experience: z.union([z.enum(['any', 'fit']), z.number().int().min(0).max(20)]),
        level: z.enum(['all', 'intern', 'junior', 'middle', 'senior', 'lead']),
        noArmy: z.boolean(),
        domain: z.enum(['all', ...JOB_DOMAINS]),
        reservation: z.boolean(),
      })
      .partial(),
    /** Board column id -> sort mode. */
    boardSort: z.record(z.string().max(64), z.enum(['smart', 'manual'])),
    kitLang: z.enum(['auto', 'en', 'uk', 'ru']),
    /** Which label groups the job cards show. */
    cardLabels: z.object({ domains: z.boolean(), military: z.boolean(), reservation: z.boolean(), testTask: z.boolean(), partTime: z.boolean(), urgent: z.boolean() }).partial(),
    /** Offer Genie: on (tips + motivation), quiet (only important: goal, health, celebrations), off; daily goal. */
    genie: z.object({ mode: z.enum(['on', 'quiet', 'off']), goal: z.number().int().min(1).max(50) }).partial(),
    /** "You keep hiding X" tips the user waved away (by term). */
    hideTipsDismissed: z.array(z.string().max(60)).max(50),
    /** Skills the user said they have no experience with ("Є досвід з X?" → Ні): never asked again. */
    skillsDeclined: z.array(z.string().max(60)).max(200),
  })
  .partial();

export type UiPrefs = z.infer<typeof uiPrefsSchema>;

/** Lenient read: a stored value that no longer validates is ignored key by key, never a crash. */
export function parseUiPrefs(raw: unknown): UiPrefs {
  if (!raw || typeof raw !== 'object') return {};
  const out: UiPrefs = {};
  for (const key of Object.keys(uiPrefsSchema.shape) as (keyof UiPrefs)[]) {
    const r = uiPrefsSchema.shape[key].safeParse((raw as Record<string, unknown>)[key]);
    if (r.success && r.data !== undefined) (out as Record<string, unknown>)[key] = r.data;
  }
  return out;
}

/** Shallow-merges each top-level section (feed filters are merged field by field). */
export function mergeUiPrefs(current: UiPrefs, patch: UiPrefs): UiPrefs {
  return {
    ...current,
    ...patch,
    ...(patch.feed ? { feed: { ...current.feed, ...patch.feed } } : {}),
    ...(patch.boardSort ? { boardSort: { ...current.boardSort, ...patch.boardSort } } : {}),
    ...(patch.genie ? { genie: { ...current.genie, ...patch.genie } } : {}),
    ...(patch.cardLabels ? { cardLabels: { ...current.cardLabels, ...patch.cardLabels } } : {}),
  };
}
