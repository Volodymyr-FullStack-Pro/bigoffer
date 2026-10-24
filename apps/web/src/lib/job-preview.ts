import 'server-only';
import { lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP, type LookupFunction } from 'node:net';

export type JobPreview = { title: string | null; company: string | null; location: string | null; salary: string | null; recruiter?: string | null; /** false when nothing on the page reads like a job (a random page saved by the bookmark). */ looksLikeJob?: boolean };

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

function ipv4Public(ip: string): boolean {
  const [a = 0, b = 0, c = 0] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** Expands an IPv6 literal into eight 16-bit groups (handles "::" and a trailing dotted IPv4). */
function ipv6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase().split('%')[0]!;
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const o = dotted[2]!.split('.').map(Number);
    text = `${dotted[1]}${((o[0]! << 8) | o[1]!).toString(16)}:${((o[2]! << 8) | o[3]!).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part ? part.split(':').map((g) => parseInt(g, 16)) : []);
  const head = parse(halves[0]!);
  const tail = halves.length === 2 ? parse(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array<number>(Math.max(fill, 0)).fill(0), ...tail];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** True only for globally routable unicast addresses (blocks SSRF to the host, LAN and cloud metadata). */
export function isPublicIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return ipv4Public(ip);
  if (version !== 6) return false;
  const g = ipv6Groups(ip);
  if (!g) return false;
  // IPv4-mapped (::ffff:a.b.c.d, also in hex form) and IPv4-compatible: judge by the embedded IPv4.
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) return ipv4Public(v4From(g[6]!, g[7]!));
  // 6to4 embeds an IPv4 address in groups 1-2.
  if (g[0] === 0x2002) return ipv4Public(v4From(g[1]!, g[2]!));
  // Only global unicast 2000::/3 is allowed; this drops ::, ::1, ULA, link-local, site-local, multicast, NAT64 (64:ff9b::/96).
  if ((g[0]! & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8)) return false; // Teredo, documentation
  return true;
}

type LookupResult = { address: string; family: number };

/** DNS lookup that refuses to connect anywhere non-public: the check runs on the address actually used. */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return (callback as (e: Error) => void)(err);
    const list = addresses as unknown as LookupResult[];
    if (list.length === 0 || !list.every((a) => isPublicIp(a.address))) {
      return (callback as (e: Error) => void)(Object.assign(new Error('blocked address'), { code: 'EBLOCKED' }));
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupResult[]) => void)(null, list);
    return (callback as unknown as (e: null, a: string, f: number) => void)(null, list[0]!.address, list[0]!.family);
  });
};

/** Static target checks (protocol, port, credentials, IP literals); hostnames are checked in `guardedLookup`. */
export function checkTarget(url: URL): boolean {
  if (!/^https?:$/.test(url.protocol) || (url.port && !['80', '443'].includes(url.port)) || url.username || url.password) return false;
  // Node skips `lookup` for IP literals, so validate them here (brackets stripped for IPv6).
  const host = url.hostname.replace(/^\[|\]$/g, '');
  return !isIP(host) || isPublicIp(host);
}

function get(url: URL, redirects: number, deadline: number): Promise<string | null> {
  if (!checkTarget(url)) return Promise.resolve(null);
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve(null);
  const lib = url.protocol === 'https:' ? https : http;
  return new Promise((resolve) => {
    const timer: { id?: NodeJS.Timeout } = {};
    const finish = (value: string | Promise<string | null> | null) => {
      clearTimeout(timer.id);
      resolve(value);
    };
    // agent: false → a fresh, unpooled socket per request that always goes through `lookup` (and ignores env proxies).
    const req = lib.get(
      url,
      { agent: false, lookup: guardedLookup, timeout: TIMEOUT_MS, headers: { 'user-agent': 'Mozilla/5.0 (compatible; BigOfferBot/1.0)', accept: 'text/html' } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects >= MAX_REDIRECTS) return finish(null);
          let next: URL;
          try {
            next = new URL(res.headers.location, url);
          } catch {
            return finish(null);
          }
          clearTimeout(timer.id);
          return resolve(get(next, redirects + 1, deadline));
        }
        if (status !== 200) {
          res.resume();
          return finish(null);
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy();
            return finish(Buffer.concat(chunks).toString('utf8'));
          }
          chunks.push(chunk);
        });
        res.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
        res.on('error', () => finish(null));
      },
    );
    timer.id = setTimeout(() => req.destroy(), remaining);
    req.on('timeout', () => req.destroy());
    req.on('error', () => finish(null));
  });
}

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

const MAX_PARSE_CHARS = 512_000;
const MAX_LD = 200_000;
const OPEN_TAG = /<(meta|title|script)\b[^<>]{0,4096}>/iy;
const NAME_CHAR = /[a-z0-9:_-]/i;

/** Hand-written linear attribute scanner (quoted values only): every character is visited at most twice. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const n = tag.length;
  let i = 0;
  while (i < n) {
    if (!NAME_CHAR.test(tag[i]!)) {
      i++;
      continue;
    }
    const start = i;
    while (i < n && NAME_CHAR.test(tag[i]!)) i++;
    const name = tag.slice(start, i).toLowerCase();
    let j = i;
    while (j < n && /\s/.test(tag[j]!)) j++;
    if (tag[j] !== '=') continue;
    j++;
    while (j < n && /\s/.test(tag[j]!)) j++;
    const quote = tag[j];
    if (quote !== '"' && quote !== "'") {
      i = j;
      continue;
    }
    const close = tag.indexOf(quote, j + 1);
    if (close === -1) break;
    out[name] ??= tag.slice(j + 1, close);
    i = close + 1;
  }
  return out;
}

type Scan = { ld: string[]; ogTitle: string | null; ogSite: string | null; ogDescription: string | null; title: string | null };

/** Linear single-pass scan: every regex is anchored (sticky) and bounded, bodies are found with indexOf. */
function scan(html: string): Scan {
  const text = html.slice(0, MAX_PARSE_CHARS);
  const lower = text.toLowerCase();
  const headEnd = lower.indexOf('</head');
  const out: Scan = { ld: [], ogTitle: null, ogSite: null, ogDescription: null, title: null };
  // JSON-LD may sit in <body>, so only the meta/title search is limited to <head> when it exists.
  const metaLimit = headEnd === -1 ? text.length : headEnd;
  let titleDone = false;
  let i = text.indexOf('<');
  while (i !== -1) {
    OPEN_TAG.lastIndex = i;
    const m = OPEN_TAG.exec(text);
    let next = i + 1;
    if (m) {
      const kind = m[1]!.toLowerCase();
      const end = i + m[0].length;
      next = end;
      if (kind === 'meta' && i < metaLimit) {
        const a = attrs(m[0]);
        const key = (a.property ?? a.name ?? '').toLowerCase();
        const content = a.content ? decode(a.content) || null : null;
        if (key === 'og:title') out.ogTitle ??= content;
        else if (key === 'og:site_name') out.ogSite ??= content;
        else if (key === 'og:description' || key === 'description') out.ogDescription ??= content;
      } else if (kind === 'title' && i < metaLimit && !titleDone) {
        // Search for the closing tag once: either it is found (and we skip past it) or no later <title> can close either.
        titleDone = true;
        const close = lower.indexOf('</title', end);
        if (close !== -1) {
          next = close;
          if (close - end <= 2000) out.title = decode(text.slice(end, close)) || null;
        }
      } else if (kind === 'script') {
        const close = lower.indexOf('</script', end);
        if (close === -1) break;
        next = close;
        if (attrs(m[0]).type?.toLowerCase() === 'application/ld+json' && close - end <= MAX_LD) out.ld.push(text.slice(end, close));
      }
    }
    i = text.indexOf('<', next);
  }
  return out;
}

const cap = (v: string | null, n: number) => (v ? v.slice(0, n) : null);

type Ld = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function ldSalary(base: unknown): string | null {
  const b = base as { currency?: unknown; value?: { minValue?: unknown; maxValue?: unknown; value?: unknown; unitText?: unknown } } | undefined;
  if (!b?.value) return null;
  const min = b.value.minValue ?? b.value.value;
  const max = b.value.maxValue;
  const range = [min, max].filter((v) => typeof v === 'number' || typeof v === 'string').join('–');
  if (!range) return null;
  return [range, str(b.currency), str(b.value.unitText) ? `/ ${str(b.value.unitText)}` : null].filter(Boolean).join(' ');
}

// A role named in a post: "Jun+/Middle Full-Stack Developer", "Senior React Engineer", "QA розробник"…
const ROLE = /((?:(?:jun(?:ior)?\+?|middle\+?|mid|senior|strong|lead|trainee)[\s/+-]*){0,3}(?:full[\s-]?stack|front[\s-]?end|back[\s-]?end|react(?: native)?|node(?:\.js)?|typescript|javascript|python|java|php|\.net|golang|go|qa|aqa|devops|mobile|ios|android|data|ml|ai|web|software)?[\s/-]*(?:developer|engineer|розробник|разработчик|інженер|инженер))/i;

/** Words a job page uses: hiring, vacancy, apply, requirements, salary… (EN / UK / RU). */
const JOB_WORDS = /\b(?:hiring|vacanc|job opening|apply now|join our team|we are looking for|requirements|responsibilities|salary)|ваканс|шукаємо|шукаю|ищем|ищу|наймаємо|вимоги|требования|обов.язки|обязанности|зарплат|відгукнутися|откликнуться/i;

/**
 * A recruiter's LinkedIn (or similar) post shared as a job: the page title is the post text, then the author, then a
 * comment count. Turn it into a card: the role it names as the title, the author as the recruiter.
 */
function socialPost(found: Scan): JobPreview | null {
  const site = (found.ogSite ?? '').toLowerCase();
  const raw = found.ogTitle ?? found.title ?? '';
  if (!/linkedin|facebook|x\.com|twitter|telegram/.test(site) && !/\|\s*(?:коментарі|комментарии|comments)\s*\(\d+\)/i.test(raw)) return null;
  const parts = raw.split(/\s+\|\s+/).map((x) => x.trim()).filter(Boolean);
  const text = [parts[0] ?? '', found.ogDescription ?? ''].join(' ');
  const author = parts.find((x, i) => i > 0 && !/linkedin|коментарі|комментарии|comments|\(\d+\)/i.test(x) && /^\p{Lu}[\p{L}'’-]+(?:\s+\p{Lu}[\p{L}'’-]+){1,2}$/u.test(x)) ?? null;
  const m = ROLE.exec(text);
  const role = m?.[1]?.replace(/\s+/g, ' ').trim();
  // Only a role with something before "developer" ("Full-Stack Developer"), never the bare word.
  const title = role && role.split(' ').length > 1 ? role.replace(/^./, (c) => c.toUpperCase()) : (parts[0] ?? raw).slice(0, 90).replace(/\s+\S*$/, '…');
  return { title, company: null, location: null, salary: null, recruiter: author };
}

export function parseJobPreview(html: string): JobPreview {
  const found = scan(html);
  const done = (p: JobPreview): JobPreview => ({ title: cap(p.title, 300), company: cap(p.company, 200), location: cap(p.location, 200), salary: cap(p.salary, 120), ...(p.recruiter ? { recruiter: cap(p.recruiter, 120) } : {}), ...(p.looksLikeJob === false ? { looksLikeJob: false } : {}) });
  for (const body of found.ld) {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      continue;
    }
    const nodes = (Array.isArray(data) ? data : [data, ...(((data as Ld)?.['@graph'] as unknown[]) ?? [])]) as Ld[];
    const job = nodes.find((n) => n && n['@type'] === 'JobPosting');
    if (!job) continue;
    const loc = (Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation) as { address?: { addressLocality?: unknown; addressCountry?: unknown } } | undefined;
    return done({
      title: str(job.title),
      company: str((job.hiringOrganization as Ld | undefined)?.name),
      location: str(loc?.address?.addressLocality) ?? str(loc?.address?.addressCountry),
      salary: ldSalary(job.baseSalary),
    });
  }
  const social = socialPost(found);
  const text = [found.ogTitle, found.title, found.ogDescription].filter(Boolean).join(' ');
  const looksLikeJob = ROLE.test(text) || JOB_WORDS.test(text);
  if (social) return done({ ...social, looksLikeJob });
  return done({ title: found.ogTitle ?? found.title, company: found.ogSite, location: null, salary: null, looksLikeJob });
}

export async function fetchJobPreview(raw: string): Promise<JobPreview | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const html = await get(url, 0, Date.now() + TIMEOUT_MS);
  return html ? parseJobPreview(html) : null;
}
