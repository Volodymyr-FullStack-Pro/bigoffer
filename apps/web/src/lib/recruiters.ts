/** A person (or channel) to write to about a vacancy. */
export type RecruiterContact = {
  kind: 'linkedin' | 'email' | 'telegram';
  /** What the button shows: a person's name, an e-mail address or a @handle. */
  label: string;
  /** Role line from the profile ("Talent Acquisition at Acme"), when known. */
  title?: string;
  href: string;
  /** False when the search result says they left the company ("ex-Acme", "formerly at Acme"); unknown otherwise. */
  current?: boolean;
  /** Named in the vacancy itself: the company chose this contact. */
  posted?: boolean;
};

export type SearchResult = { title: string; url: string; description?: string };

const RECRUITER = /recruit|talent|sourc(?:er|ing)|\bhr\b|human resources|people partner|hiring|рекрут|рекрутер|hr-|кадр/i;
const LEGAL = new Set(['llc', 'ltd', 'inc', 'gmbh', 'sa', 'corp', 'corporation', 'company', 'group', 'тов', 'ооо', 'фоп', 'пп']);

/** "SoftServe Inc." → "softserve"; used to match a company in search results and as the cache key. */
export function companyKey(name: string): string {
  return name
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !LEGAL.has(w))
    .join(' ');
}

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

/** E-mails, Telegram handles and LinkedIn profiles a vacancy itself names as the contact. */
export function contactsFromDescription(text: string): RecruiterContact[] {
  const plain = stripTags(text);
  const out = new Map<string, RecruiterContact>();
  for (const m of plain.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}/gi)) {
    const email = m[0].toLowerCase();
    if (/^(?:no-?reply|support|info|privacy|gdpr)@/.test(email)) continue;
    out.set(email, { kind: 'email', label: email, href: `mailto:${email}` });
  }
  for (const m of plain.matchAll(/(?:t\.me\/|telegram\s*:?\s*@|tg\s*:?\s*@)([a-z][\w]{4,31})/gi)) {
    const handle = m[1]!;
    out.set(`tg:${handle.toLowerCase()}`, { kind: 'telegram', label: `@${handle}`, href: `https://t.me/${handle}` });
  }
  for (const m of plain.matchAll(/(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([\w%-]+)/gi)) {
    const slug = m[1]!;
    out.set(`li:${slug.toLowerCase()}`, { kind: 'linkedin', label: decodeURIComponent(slug).replace(/-[0-9a-f]{6,}$/i, '').replace(/-/g, ' '), href: `https://www.linkedin.com/in/${slug}`, posted: true });
  }
  return [...out.values()].slice(0, 3);
}

/** The web-search query that finds a company's recruiters' public LinkedIn profiles. */
export function recruiterQuery(company: string): string {
  return `site:linkedin.com/in "${company.trim()}" (recruiter OR "talent acquisition" OR HR OR рекрутер)`;
}

/** A broad query (any site: DOU, Djinni, Telegram, the company's careers page) for the company's HR contacts. */
export function hrContactQuery(company: string): string {
  return `"${company.trim()}" рекрутер OR recruiter OR HR контакти OR contacts`;
}

const HR_MAILBOX = /^(?:hr|recruit\w*|career\w*|jobs?|talent\w*|hiring|people|cv|resume|vacanc\w*)[\w.+-]*@/i;

/**
 * HR e-mails and recruiters' Telegram handles named in broad search results that mention the company: an address
 * must look like an HR mailbox, a handle must sit next to a recruiting word.
 */
export function hrContactsFromResults(results: readonly SearchResult[], company: string, max = 2): RecruiterContact[] {
  const key = companyKey(company);
  if (!key) return [];
  const out = new Map<string, RecruiterContact>();
  for (const r of results) {
    const text = `${stripTags(r.title)} ${stripTags(r.description ?? '')}`;
    if (!` ${companyKey(text)} `.includes(` ${key} `)) continue;
    for (const c of contactsFromDescription(text)) {
      if (c.kind === 'email' && !HR_MAILBOX.test(c.label)) continue;
      if (c.kind === 'telegram' && !RECRUITER.test(text)) continue;
      if (c.kind === 'linkedin') continue; // profiles come from recruitersFromResults, which checks the role
      out.set(c.href, c);
    }
    if (out.size >= max) break;
  }
  return [...out.values()].slice(0, max);
}

/**
 * Keeps LinkedIn profiles whose title or snippet names both the company and a recruiting role. Titles look like
 * "Olena Petrenko - Talent Acquisition - SoftServe | LinkedIn".
 */
const PAST = /(?:^|\s)(?:ex|former|formerly|previously|past|колишн\p{L}*|бывш\p{L}*|раніше|ранее)(?:\s+(?:at|in|в|у))?\s+$/u;

/** The text names the company only as a past employer: "ex-Acme", "Former recruiter at Acme", "Previously: Acme". */
function leftCompany(text: string, key: string): boolean {
  const words = ` ${companyKey(text)} `;
  let at = words.indexOf(` ${key} `);
  if (at < 0) return false;
  while (at >= 0) {
    const before = words.slice(Math.max(0, at - 40), at + 1).replace(/\b(?:recruiter|sourcer|hr|talent|acquisition|specialist|manager|lead|partner)\b/g, ' ').replace(/\s+/g, ' ');
    if (!PAST.test(before)) return false;
    at = words.indexOf(` ${key} `, at + 1);
  }
  return true;
}

export function recruitersFromResults(results: readonly SearchResult[], company: string, max = 3): RecruiterContact[] {
  const key = companyKey(company);
  if (!key) return [];
  const out = new Map<string, RecruiterContact>();
  for (const r of results) {
    const slug = r.url.match(/linkedin\.com\/in\/([\w%-]+)/i)?.[1];
    if (!slug) continue;
    const title = stripTags(r.title).replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
    const text = `${title} ${stripTags(r.description ?? '')}`;
    if (!` ${companyKey(text)} `.includes(` ${key} `) || !RECRUITER.test(text)) continue;
    const [name, ...rest] = title.split(/\s+[-–—]\s+/);
    if (!name || name.length > 60) continue;
    const id = slug.toLowerCase();
    const current = !leftCompany(text, key);
    if (!out.has(id)) out.set(id, { kind: 'linkedin', label: name, title: rest.join(' · ') || undefined, href: `https://www.linkedin.com/in/${slug}`, ...(current ? {} : { current }) });
    if (out.size >= max) break;
  }
  return [...out.values()];
}

export type RankedContact = RecruiterContact & {
  /** Works at the job's company now, as far as the search result tells. */
  current: boolean;
  /** The one to write to first, when there is a choice. */
  best: boolean;
};

const SOURCER = /sourc|talent acquisition|recruit|рекрут|talent partner|hiring/i;
const HR = /\bhr\b|human resources|people partner|people ops/i;
const UA = /ukraine|україн|украин|kyiv|київ|lviv|львів|kharkiv|харків|dnipro|дніпр|odesa|одес/i;

/**
 * Who to write to first. A contact the posting itself names comes first; then recruiters who work at the company
 * now, sourcers and talent-acquisition people before HR generalists before leads and managers; people the result
 * names as past employees last.
 */
export function rankRecruiters(contacts: readonly RecruiterContact[]): RankedContact[] {
  const scored = contacts.map((c, i) => {
    const role = c.title ?? '';
    const current = c.current !== false;
    const searched = c.kind === 'linkedin' && !c.posted;
    let score = searched ? 50 : 100;
    if (searched) {
      if (SOURCER.test(role)) score += 20;
      else if (HR.test(role)) score += 10;
      if (/lead|head|director|manager|vp/i.test(role)) score -= 5;
      if (UA.test(role)) score += 3;
      if (!current) score -= 40;
    }
    return { contact: { ...c, current, best: false }, score, i };
  });
  scored.sort((a, b) => b.score - a.score || a.i - b.i);
  const out = scored.map((s) => s.contact);
  if (out.length >= 2 && out[0]!.current) out[0]!.best = true;
  return out;
}
