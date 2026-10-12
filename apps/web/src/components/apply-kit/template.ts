import type { KitCandidate } from '@jp/ai';

const CONTACT_KEYS = ['email', 'phone', 'linkedin', 'github', 'cv', 'portfolio', 'telegram'] as const;

/** The profile's name and non-empty string contacts, for the [Full name] / [Phone] / … template placeholders. */
export function kitCandidate(row: { full_name: string | null; contacts: unknown } | null | undefined): KitCandidate {
  const raw = row?.contacts && typeof row.contacts === 'object' ? (row.contacts as Record<string, unknown>) : {};
  const contacts: KitCandidate['contacts'] = {};
  for (const key of CONTACT_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v.trim()) contacts[key] = v.trim();
  }
  return { fullName: row?.full_name?.trim() || null, contacts };
}
