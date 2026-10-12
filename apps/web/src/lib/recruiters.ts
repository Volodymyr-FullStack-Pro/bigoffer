/** A person (or channel) to write to about a vacancy. */
export type RecruiterContact = {
  kind: 'linkedin' | 'email' | 'telegram';
  /** What the button shows: a person's name, an e-mail address or a @handle. */
  label: string;
  /** Role line from the profile ("Talent Acquisition at Acme"), when known. */
  title?: string;
  href: string;
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
    out.set(`li:${slug.toLowerCase()}`, { kind: 'linkedin', label: decodeURIComponent(slug).replace(/-[0-9a-f]{6,}$/i, '').replace(/-/g, ' '), href: `https://www.linkedin.com/in/${slug}` });
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
    if (!out.has(id)) out.set(id, { kind: 'linkedin', label: name, title: rest.join(' · ') || undefined, href: `https://www.linkedin.com/in/${slug}` });
    if (out.size >= max) break;
  }
  return [...out.values()];
}
