export type TgLocale = 'en' | 'uk' | 'ru';

export type InlineButton = { text: string; url: string } | { text: string; callback_data: string };
export type InlineKeyboard = { inline_keyboard: InlineButton[][] };

export type AlertJob = {
  matchId: string;
  title: string;
  company: string | null;
  score: number;
  salary: string | null;
  location: string | null;
  remote: string | null;
  why: string | null;
  /** Board the job was found on ("Djinni") and the original posting URL. */
  source?: string | null;
  jobUrl?: string | null;
};

export type CallbackAction = { kind: 'hide' | 'applied'; matchId: string };

type Dict = {
  open: string;
  posting: string;
  hide: string;
  applied: string;
  overflow: (n: number) => string;
  digestTitle: (n: number) => string;
  digestEmpty: string;
  followUps: string;
  remote: Record<string, string>;
};

const DICT: Record<TgLocale, Dict> = {
  en: {
    open: 'Open in BigOffer',
    posting: 'Job posting ↗',
    hide: 'Hide',
    applied: 'Applied',
    overflow: (n) => `${n} more new ${n === 1 ? 'job' : 'jobs'} in BigOffer`,
    digestTitle: (n) => `Digest: ${n} new ${n === 1 ? 'job' : 'jobs'} in the last 24 hours`,
    digestEmpty: 'No new jobs in the last 24 hours.',
    followUps: 'Time to follow up',
    remote: { remote: 'Remote', hybrid: 'Hybrid', office: 'Office' },
  },
  uk: {
    open: 'Відкрити в BigOffer',
    posting: 'Вакансія ↗',
    hide: 'Сховати',
    applied: 'Подано',
    overflow: (n) => `ще ${n} ${ukPlural(n)} у BigOffer`,
    digestTitle: (n) => `Дайджест: ${n} ${ukPlural(n)} за добу`,
    digestEmpty: 'За добу нових вакансій немає.',
    followUps: 'Час нагадати про себе',
    remote: { remote: 'Віддалено', hybrid: 'Гібрид', office: 'Офіс' },
  },
  ru: {
    open: 'Открыть в BigOffer',
    posting: 'Вакансия ↗',
    hide: 'Скрыть',
    applied: 'Отклик отправлен',
    overflow: (n) => `ещё ${n} ${ruPlural(n)} в BigOffer`,
    digestTitle: (n) => `Дайджест: ${n} ${ruPlural(n)} за сутки`,
    digestEmpty: 'За сутки новых вакансий нет.',
    followUps: 'Пора напомнить о себе',
    remote: { remote: 'Удалённо', hybrid: 'Гибрид', office: 'Офис' },
  },
};

function ukPlural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'нова вакансія';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'нові вакансії';
  return 'нових вакансій';
}

function ruPlural(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'новая вакансия';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'новые вакансии';
  return 'новых вакансий';
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Truncate raw (unescaped) text by code points; escape afterwards so entities are never cut. */
function clip(s: string, max: number): string {
  const chars = Array.from(s.trim());
  return chars.length <= max ? chars.join('') : `${chars.slice(0, max - 1).join('').trimEnd()}…`;
}

const safe = (s: string, max: number) => escapeHtml(clip(s, max));

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCallback(a: CallbackAction): string {
  return `${a.kind === 'hide' ? 'h' : 'a'}:${a.matchId}`;
}

export function decodeCallback(data: string): CallbackAction | null {
  if (data.length !== 38 || data[1] !== ':') return null;
  const id = data.slice(2);
  if (!UUID_RE.test(id)) return null;
  if (data[0] === 'h') return { kind: 'hide', matchId: id };
  if (data[0] === 'a') return { kind: 'applied', matchId: id };
  return null;
}

const base = (siteUrl: string) => siteUrl.replace(/\/+$/, '');

function alertLines(job: AlertJob, locale: TgLocale): string[] {
  const lines = [`🔥 <b>${Math.round(job.score)}%</b> · ${safe(job.title, 200)}`];
  const origin = [job.company, job.source].filter((v): v is string => Boolean(v && v.trim())).map((v) => safe(v, 100));
  if (origin.length > 0) lines.push(origin.join(' · '));
  const remote = job.remote ? (DICT[locale].remote[job.remote] ?? job.remote) : null;
  const meta = [job.salary, job.location, remote]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => safe(v, 80));
  if (meta.length > 0) lines.push(meta.join(' · '));
  if (job.why && job.why.trim()) lines.push('', `<i>${safe(job.why, 300)}</i>`);
  return lines;
}

export function alertMessage(
  job: AlertJob,
  locale: TgLocale,
  siteUrl: string,
): { text: string; replyMarkup: InlineKeyboard } {
  const t = DICT[locale];
  return {
    text: alertLines(job, locale).join('\n'),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: t.open, url: `${base(siteUrl)}/${locale}/today?match=${encodeURIComponent(job.matchId)}` },
          ...(job.jobUrl && /^https?:\/\//i.test(job.jobUrl) ? [{ text: t.posting, url: job.jobUrl }] : []),
        ],
        [
          { text: t.hide, callback_data: encodeCallback({ kind: 'hide', matchId: job.matchId }) },
          { text: t.applied, callback_data: encodeCallback({ kind: 'applied', matchId: job.matchId }) },
        ],
      ],
    },
  };
}

export function overflowMessage(count: number, locale: TgLocale, siteUrl: string): string {
  return `${DICT[locale].overflow(count)}\n${base(siteUrl)}/${locale}/today`;
}

/** Telegram's limit for a message text, in UTF-16 code units. */
const MESSAGE_LIMIT = 4096;

export function digestMessage(
  d: { total: number; top: AlertJob[]; followUps: { company: string; title: string }[] },
  locale: TgLocale,
  siteUrl: string,
): { text: string; replyMarkup: InlineKeyboard } {
  const t = DICT[locale];
  const jobs = d.top.slice(0, 10).map((j) => {
    const company = j.company ? ` — ${safe(j.company, 60)}` : '';
    return `• <b>${Math.round(j.score)}%</b> ${safe(j.title, 100)}${company}`;
  });
  const followUps = d.followUps.slice(0, 10).map((f) => `• ${safe(f.company, 60)} — ${safe(f.title, 100)}`);
  const build = () => {
    const lines = [`<b>${escapeHtml(t.digestTitle(d.total))}</b>`];
    if (jobs.length === 0) lines.push(t.digestEmpty);
    else lines.push('', ...jobs);
    if (followUps.length > 0) lines.push('', `⏰ <b>${escapeHtml(t.followUps)}</b>`, ...followUps);
    return lines.join('\n');
  };
  // Over the limit: drop trailing items, from the longer list first, keeping at least one of each
  // (a single clipped line of each always fits) so both sections and their headings survive.
  let text = build();
  while (text.length > MESSAGE_LIMIT && (jobs.length > 1 || followUps.length > 1)) {
    if (jobs.length > followUps.length || followUps.length <= 1) jobs.pop();
    else followUps.pop();
    text = build();
  }
  return {
    text,
    replyMarkup: { inline_keyboard: [[{ text: t.open, url: `${base(siteUrl)}/${locale}/today` }]] },
  };
}

export function toTgLocale(value: string | null | undefined): TgLocale {
  const base = (value ?? '').slice(0, 2).toLowerCase();
  return base === 'uk' || base === 'ru' ? base : 'en';
}

type Replies = {
  welcome: (minScore: number, digestHour: number) => string;
  howToLink: string;
  expired: string;
  stopped: string;
  hidden: string;
  added: string;
  unavailable: string;
};

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

const REPLIES: Record<TgLocale, Replies> = {
  en: {
    welcome: (s, h) => `Done! New jobs with a match of ${s}% or more will arrive here, and a daily digest at ${hh(h)}.`,
    howToLink: 'To link this chat, open BigOffer → Profile → Connect Telegram.',
    expired: 'This link has expired. Generate a new one in your BigOffer profile.',
    stopped: 'Notifications are off. Reconnect from your BigOffer profile at any time.',
    hidden: 'Hidden',
    added: 'Added to the board',
    unavailable: 'Unavailable',
  },
  uk: {
    welcome: (s, h) => `Готово! Сюди прийдуть нові вакансії від ${s}% і щоденний дайджест о ${hh(h)}.`,
    howToLink: 'Щоб підключити цей чат, відкрийте BigOffer → Профіль → Підключити Telegram.',
    expired: 'Посилання застаріло — згенеруйте нове в профілі BigOffer.',
    stopped: 'Сповіщення вимкнено. Підключити знову можна в профілі BigOffer.',
    hidden: 'Сховано',
    added: 'Додано на дошку',
    unavailable: 'Недоступно',
  },
  ru: {
    welcome: (s, h) => `Готово! Сюда придут новые вакансии от ${s}% и ежедневный дайджест в ${hh(h)}.`,
    howToLink: 'Чтобы подключить этот чат, откройте BigOffer → Профиль → Подключить Telegram.',
    expired: 'Ссылка устарела — создайте новую в профиле BigOffer.',
    stopped: 'Уведомления выключены. Подключить снова можно в профиле BigOffer.',
    hidden: 'Скрыто',
    added: 'Добавлено на доску',
    unavailable: 'Недоступно',
  },
};

export function botReplies(locale: TgLocale): Replies {
  return REPLIES[locale];
}
