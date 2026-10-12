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
  /** Short labels shown under the title: army, reservation, urgent, level, field. */
  labels?: string[];
};

export type CallbackAction = { kind: 'hide' | 'applied' | 'save'; matchId: string };

type Dict = {
  kit: string;
  save: string;
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
    kit: '✍️ Apply kit',
    save: '⭐ Save',
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
    kit: '✍️ Набір для відгуку',
    save: '⭐ Зберегти',
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
    kit: '✍️ Набор для отклика',
    save: '⭐ Сохранить',
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
  return `${a.kind === 'hide' ? 'h' : a.kind === 'save' ? 's' : 'a'}:${a.matchId}`;
}

export function decodeCallback(data: string): CallbackAction | null {
  if (data.length !== 38 || data[1] !== ':') return null;
  const id = data.slice(2);
  if (!UUID_RE.test(id)) return null;
  if (data[0] === 'h') return { kind: 'hide', matchId: id };
  if (data[0] === 'a') return { kind: 'applied', matchId: id };
  if (data[0] === 's') return { kind: 'save', matchId: id };
  return null;
}

const base = (siteUrl: string) => siteUrl.replace(/\/+$/, '');

function alertLines(job: AlertJob, locale: TgLocale): string[] {
  const lines = [`🔥 <b>${Math.round(job.score)}%</b> · ${safe(job.title, 200)}`];
  const origin = [job.company, job.source].filter((v): v is string => Boolean(v && v.trim())).map((v) => safe(v, 100));
  if (origin.length > 0) lines.push(origin.join(' · '));
  if (job.labels && job.labels.length > 0) lines.push(job.labels.map((l) => safe(l, 40)).join(' · '));
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
        // Opens BigOffer on this job with the apply kit already expanded.
        [{ text: t.kit, url: `${base(siteUrl)}/${locale}/today?match=${encodeURIComponent(job.matchId)}&kit=1` }],
        [
          { text: t.save, callback_data: encodeCallback({ kind: 'save', matchId: job.matchId }) },
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

/** The Offer Genie's line in the morning digest: yesterday vs. the goal, the streak, or a nudge after idle days. */
export type DigestGoal = { yesterday: number; goal: number; streak: number; idleDays: number };

const GENIE: Record<TgLocale, { met: (d: number, g: number) => string; short: (d: number, g: number) => string; streak: (n: number) => string; idle: (n: number) => string; mottos: string[] }> = {
  en: {
    met: (d, g) => `🧞 Yesterday: ${d}/${g} — goal reached! 🎉`,
    short: (d, g) => `🧞 Yesterday: ${d}/${g} applications. Today let’s close the goal 💪`,
    streak: (n) => `Streak: 🔥${n} days`,
    idle: (n) => `🧞 ${n} days without applications — the best jobs go in the first hours. Start with the top ones below!`,
    mottos: ['Every application is a step towards an offer.', 'Replies go to the first applicants — be quick today.', 'A small application today beats a perfect one never.', 'A rejection is a “not here”, not a “no”.', 'Today’s applications are tomorrow’s interviews.'],
  },
  uk: {
    met: (d, g) => `🧞 Вчора: ${d}/${g} — ціль виконано! 🎉`,
    short: (d, g) => `🧞 Вчора: ${d}/${g} відгуків. Сьогодні закриємо ціль 💪`,
    streak: (n) => `Серія: 🔥${n} дн. поспіль`,
    idle: (n) => `🧞 Вже ${n} дні без відгуків — найкращі вакансії розбирають за перші години. Почни з топових нижче!`,
    mottos: ['Кожен відгук — крок до оферу.', 'Відповідь отримують перші — будь швидким сьогодні.', 'Маленький відгук сьогодні > ідеальний ніколи.', 'Відмова — це «не тут», а не «ні».', 'Сьогоднішні відгуки — це завтрашні співбесіди.'],
  },
  ru: {
    met: (d, g) => `🧞 Вчера: ${d}/${g} — цель выполнена! 🎉`,
    short: (d, g) => `🧞 Вчера: ${d}/${g} откликов. Сегодня закроем цель 💪`,
    streak: (n) => `Серия: 🔥${n} дн. подряд`,
    idle: (n) => `🧞 Уже ${n} дня без откликов — лучшие вакансии разбирают в первые часы. Начни с топовых ниже!`,
    mottos: ['Каждый отклик — шаг к офферу.', 'Ответ получают первые — будь быстрым сегодня.', 'Маленький отклик сегодня > идеальный никогда.', 'Отказ — это «не здесь», а не «нет».', 'Сегодняшние отклики — это завтрашние собеседования.'],
  },
};

/** The genie lines for a digest (empty when there is nothing to say). `seed` picks the motto (e.g. the day). */
export function digestGenieLines(g: DigestGoal, locale: TgLocale, seed = 0): string[] {
  const t = GENIE[locale];
  if (g.idleDays >= 2) return [t.idle(g.idleDays)];
  const lines = [g.yesterday >= g.goal ? t.met(g.yesterday, g.goal) : t.short(g.yesterday, g.goal)];
  if (g.streak >= 2) lines.push(t.streak(g.streak));
  lines.push(`<i>${escapeHtml(t.mottos[Math.abs(seed) % t.mottos.length]!)}</i>`);
  return lines;
}

export function digestMessage(
  d: { total: number; top: AlertJob[]; followUps: { company: string; title: string }[]; genie?: string[] },
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
    const lines = [...(d.genie && d.genie.length > 0 ? [...d.genie, ''] : []), `<b>${escapeHtml(t.digestTitle(d.total))}</b>`];
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
  saved: string;
  help: string;
  topTitle: string;
  topEmpty: string;
  goal: (done: number, goal: number, streak: number) => string;
  paused: (until: string) => string;
  resumed: string;
  badPause: string;
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
    saved: 'Saved to the board',
    help: '<b>Commands</b>\n/top — the 5 best fresh jobs now\n/goal — today’s applications and your streak\n/pause 3h — no alerts for a while (2h, 1d…)\n/resume — alerts back on\n/stop — unlink this chat',
    topTitle: 'Best fresh jobs right now',
    topEmpty: 'No fresh jobs above your threshold right now — I’ll write as soon as one appears.',
    goal: (d, g, s) => `Today: <b>${d}/${g}</b> applications${d >= g ? ' — goal reached! 🎉' : ` — ${g - d} to go 💪`}${s >= 2 ? `\nStreak: 🔥${s} days` : ''}`,
    paused: (u) => `Alerts paused until ${u}. /resume to turn them back on.`,
    resumed: 'Alerts are back on.',
    badPause: 'Usage: /pause 3h, /pause 90m or /pause 1d',
    welcome: (s, h) => `Done! New jobs with a match of ${s}% or more will arrive here, and a daily digest at ${hh(h)}.\n\n/top — best fresh jobs now · /goal — today’s progress · /pause 3h · /help`,
    howToLink: 'To link this chat, open BigOffer → Profile → Connect Telegram.',
    expired: 'This link has expired. Generate a new one in your BigOffer profile.',
    stopped: 'Notifications are off. Reconnect from your BigOffer profile at any time.',
    hidden: 'Hidden',
    added: 'Added to the board',
    unavailable: 'Unavailable',
  },
  uk: {
    saved: 'Збережено на дошку',
    help: '<b>Команди</b>\n/top — 5 найкращих свіжих вакансій зараз\n/goal — відгуки за сьогодні та серія днів\n/pause 3h — пауза сповіщень (2h, 1d…)\n/resume — увімкнути сповіщення\n/stop — відключити чат',
    topTitle: 'Найкращі свіжі вакансії зараз',
    topEmpty: 'Зараз немає свіжих вакансій вище вашого порогу — напишу, щойно з’явиться.',
    goal: (d, g, s) => `Сьогодні: <b>${d}/${g}</b> відгуків${d >= g ? ' — ціль виконано! 🎉' : ` — ще ${g - d} 💪`}${s >= 2 ? `\nСерія: 🔥${s} дн. поспіль` : ''}`,
    paused: (u) => `Сповіщення на паузі до ${u}. /resume — увімкнути знову.`,
    resumed: 'Сповіщення знову увімкнено.',
    badPause: 'Приклад: /pause 3h, /pause 90m або /pause 1d',
    welcome: (s, h) => `Готово! Сюди прийдуть нові вакансії від ${s}% і щоденний дайджест о ${hh(h)}.\n\n/top — найкращі зараз · /goal — прогрес · /pause 3h · /help`,
    howToLink: 'Щоб підключити цей чат, відкрийте BigOffer → Профіль → Підключити Telegram.',
    expired: 'Посилання застаріло — згенеруйте нове в профілі BigOffer.',
    stopped: 'Сповіщення вимкнено. Підключити знову можна в профілі BigOffer.',
    hidden: 'Сховано',
    added: 'Додано на дошку',
    unavailable: 'Недоступно',
  },
  ru: {
    saved: 'Сохранено на доску',
    help: '<b>Команды</b>\n/top — 5 лучших свежих вакансий сейчас\n/goal — отклики за сегодня и серия дней\n/pause 3h — пауза уведомлений (2h, 1d…)\n/resume — включить уведомления\n/stop — отключить чат',
    topTitle: 'Лучшие свежие вакансии сейчас',
    topEmpty: 'Сейчас нет свежих вакансий выше вашего порога — напишу, как только появится.',
    goal: (d, g, s) => `Сегодня: <b>${d}/${g}</b> откликов${d >= g ? ' — цель выполнена! 🎉' : ` — ещё ${g - d} 💪`}${s >= 2 ? `\nСерия: 🔥${s} дн. подряд` : ''}`,
    paused: (u) => `Уведомления на паузе до ${u}. /resume — включить снова.`,
    resumed: 'Уведомления снова включены.',
    badPause: 'Пример: /pause 3h, /pause 90m или /pause 1d',
    welcome: (s, h) => `Готово! Сюда придут новые вакансии от ${s}% и ежедневный дайджест в ${hh(h)}.\n\n/top — лучшие сейчас · /goal — прогресс · /pause 3h · /help`,
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

/** "/pause 3h" → milliseconds (30 min to 14 days); null when it does not parse. */
export function parsePauseMs(text: string): number | null {
  const m = /^\/pause(?:@\w+)?\s+(\d{1,4})\s*(m|min|h|d)\s*$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2]!.toLowerCase();
  const ms = n * (unit.startsWith('m') ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000);
  return ms >= 30 * 60_000 && ms <= 14 * 86_400_000 ? ms : null;
}

/** A /top answer: the best fresh jobs as a compact list with links. */
export function topMessage(jobs: AlertJob[], locale: TgLocale, siteUrl: string): { text: string; replyMarkup: InlineKeyboard } {
  const r = REPLIES[locale];
  if (jobs.length === 0) return { text: r.topEmpty, replyMarkup: { inline_keyboard: [[{ text: DICT[locale].open, url: `${base(siteUrl)}/${locale}/today` }]] } };
  const lines = [`<b>${escapeHtml(r.topTitle)}</b>`, ''];
  for (const j of jobs.slice(0, 5)) {
    const company = j.company ? ` — ${safe(j.company, 60)}` : '';
    lines.push(`• <b>${Math.round(j.score)}%</b> <a href="${escapeHtml(`${base(siteUrl)}/${locale}/today?match=${encodeURIComponent(j.matchId)}`)}">${safe(j.title, 100)}</a>${company}`);
    if (j.labels && j.labels.length > 0) lines.push(`  ${j.labels.map((l) => safe(l, 40)).join(' · ')}`);
  }
  return { text: lines.join('\n'), replyMarkup: { inline_keyboard: [[{ text: DICT[locale].open, url: `${base(siteUrl)}/${locale}/today?fresh=1` }]] } };
}

const PERK_LABEL: Record<TgLocale, Record<'military' | 'reservation' | 'urgent' | 'testTask' | 'partTime', string>> = {
  en: { military: '🪖 Army', reservation: '🛡 Reservation', urgent: '⚡ Urgent', testTask: 'Test task', partTime: 'Part-time' },
  uk: { military: '🪖 Армія', reservation: '🛡 Бронювання', urgent: '⚡ Терміново', testTask: 'Тестове', partTime: 'Part-time' },
  ru: { military: '🪖 Армия', reservation: '🛡 Бронирование', urgent: '⚡ Срочно', testTask: 'Тестовое', partTime: 'Part-time' },
};
const DOMAIN_LABEL: Record<string, string> = {
  defense: 'DefenseTech', gambling: 'iGaming', crypto: 'Crypto', fintech: 'FinTech', ecommerce: 'E-commerce', gamedev: 'GameDev',
  health: 'HealthTech', edtech: 'EdTech', ai: 'AI', adtech: 'AdTech', logistics: 'Logistics', govtech: 'GovTech', outsource: 'Outsource',
};
const LEVEL_LABEL: Record<string, string> = { intern: 'Intern', junior: 'Junior', middle: 'Middle', senior: 'Senior', lead: 'Lead' };

/** Labels for an alert: army first (in red on the site), then reservation, urgency, level, test task, part-time, fields. */
export function alertLabels(
  j: { domains: string[]; perks: string[]; seniority: string | null },
  locale: TgLocale,
): string[] {
  const p = PERK_LABEL[locale];
  const out: string[] = [];
  if (j.domains.includes('military')) out.push(p.military);
  if (j.perks.includes('reservation')) out.push(p.reservation);
  if (j.perks.includes('urgent')) out.push(p.urgent);
  if (j.seniority && LEVEL_LABEL[j.seniority]) out.push(LEVEL_LABEL[j.seniority]!);
  if (j.perks.includes('testTask')) out.push(p.testTask);
  if (j.perks.includes('partTime')) out.push(p.partTime);
  for (const d of j.domains) if (d !== 'military' && DOMAIN_LABEL[d]) out.push(DOMAIN_LABEL[d]!);
  return out.slice(0, 5);
}

/** Whether a local hour falls into quiet hours [start, end), which may wrap past midnight (23 → 8). */
export function inQuietHours(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/** The bot's command menu per language (shown under "/" and the Menu button). */
export const BOT_COMMANDS: Record<TgLocale, { command: string; description: string }[]> = {
  en: [
    { command: 'top', description: 'Best fresh jobs right now' },
    { command: 'goal', description: 'Today’s applications and streak' },
    { command: 'pause', description: 'Pause alerts: /pause 3h, 90m, 1d' },
    { command: 'resume', description: 'Turn alerts back on' },
    { command: 'help', description: 'What the bot can do' },
    { command: 'stop', description: 'Unlink this chat' },
  ],
  uk: [
    { command: 'top', description: 'Найкращі свіжі вакансії зараз' },
    { command: 'goal', description: 'Відгуки за сьогодні та серія' },
    { command: 'pause', description: 'Пауза сповіщень: /pause 3h, 90m, 1d' },
    { command: 'resume', description: 'Увімкнути сповіщення' },
    { command: 'help', description: 'Що вміє бот' },
    { command: 'stop', description: 'Відключити цей чат' },
  ],
  ru: [
    { command: 'top', description: 'Лучшие свежие вакансии сейчас' },
    { command: 'goal', description: 'Отклики за сегодня и серия' },
    { command: 'pause', description: 'Пауза уведомлений: /pause 3h, 90m, 1d' },
    { command: 'resume', description: 'Включить уведомления' },
    { command: 'help', description: 'Что умеет бот' },
    { command: 'stop', description: 'Отключить этот чат' },
  ],
};

let commandsSet = false;

/** Registers the command menu once per process (idempotent on Telegram's side; cheap to repeat after a restart). */
export async function ensureBotCommands(bot: { setCommands?: (c: { command: string; description: string }[], lang?: string) => Promise<unknown> }): Promise<void> {
  if (commandsSet || !bot.setCommands) return;
  commandsSet = true;
  try {
    await bot.setCommands(BOT_COMMANDS.en);
    await bot.setCommands(BOT_COMMANDS.uk, 'uk');
    await bot.setCommands(BOT_COMMANDS.ru, 'ru');
  } catch {
    commandsSet = false;
  }
}
