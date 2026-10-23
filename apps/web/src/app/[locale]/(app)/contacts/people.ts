export type ContactApp = { id: string; title: string; company: string; contactName: string | null; contactUrl: string | null; lastActivityAt: string | null };
export type ContactMessage = { applicationId: string; author: string | null; sentAt: string };
export type Person = { name: string; url: string | null; cards: { id: string; title: string; company: string }[]; lastAt: string | null };

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * Everyone the user deals with, from the board: the contact on each card and the authors of incoming messages, merged
 * by name. A message author that is just the company's name is not a person.
 */
export function people(apps: readonly ContactApp[], messages: readonly ContactMessage[]): Person[] {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const out = new Map<string, Person>();
  const add = (name: string, app: ContactApp, at: string | null, url: string | null) => {
    const key = norm(name);
    if (!key || key === norm(app.company)) return;
    const p = out.get(key) ?? { name: name.trim(), url: null, cards: [], lastAt: null };
    if (url && !p.url) p.url = url;
    if (!p.cards.some((c) => c.id === app.id)) p.cards.push({ id: app.id, title: app.title, company: app.company });
    if (at && (!p.lastAt || at > p.lastAt)) p.lastAt = at;
    out.set(key, p);
  };
  for (const a of apps) if (a.contactName) add(a.contactName, a, a.lastActivityAt, a.contactUrl);
  for (const m of messages) {
    const app = byId.get(m.applicationId);
    if (app && m.author) add(m.author, app, m.sentAt, null);
  }
  return [...out.values()].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}
