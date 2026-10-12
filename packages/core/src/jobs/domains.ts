/**
 * What field a vacancy is in, read from its title, company and text (en / uk / ru), for small labels on the
 * cards. "military" is service in the armed forces (a brigade, the National Guard, a contract with the army), not
 * a defence-tech company: those are "defense".
 */
export const JOB_DOMAINS = [
  'military',
  'defense',
  'gambling',
  'crypto',
  'fintech',
  'ecommerce',
  'gamedev',
  'health',
  'edtech',
  'ai',
  'adtech',
  'logistics',
  'govtech',
  'outsource',
] as const;
export type JobDomain = (typeof JOB_DOMAINS)[number];

const L = String.raw`[\p{L}\p{N}]`;
const W = (body: string) => new RegExp(String.raw`(?<!${L})(?:${body})(?!${L})`, 'giu');

/** Strong cues count 2, ordinary ones 1; a label needs `min` points (2 unless set). */
const PATTERNS: Record<Exclude<JobDomain, 'military'>, { strong: RegExp; weak?: RegExp; min?: number }> = {
  defense: { strong: W(String.raw`defen[cs]e[ -]?tech|deftech|оборонн\p{L}* (?:промисл\p{L}*|технолог\p{L}*)|бпла|uav|дрон\p{L}*|drones?|military-grade`) },
  gambling: { strong: W(String.raw`casino|gambling|igaming|i-gaming|betting|sportsbook|казино|букмекер\p{L}*|беттинг|гемблінг|гемблинг`) },
  crypto: { strong: W(String.raw`crypto\p{L}*|blockchain|web3|defi|nft|криптовалют\p{L}*|блокчейн\p{L}*`) },
  fintech: {
    strong: W(String.raw`fintech|фінтех|финтех|neobank|payments? (?:platform|provider|processing)|платіжн\p{L}* (?:систем\p{L}*|сервіс\p{L}*)|banking|insurtech|trading platform`),
    weak: W(String.raw`bank|banks|банк|банку|банків|lending`),
  },
  ecommerce: {
    strong: W(String.raw`e-?commerce|marketplace|маркетплейс\p{L}*|інтернет-магазин\p{L}*|интернет-магазин\p{L}*`),
    weak: W(String.raw`retail|ритейл\p{L}*|рітейл\p{L}*|online store|shopify`),
  },
  gamedev: { strong: W(String.raw`game ?dev\p{L}*|gamedev|game studio|ігрова студія|игровая студия|mobile games?|video games?`), weak: W(String.raw`unity|unreal|gameplay`) },
  health: {
    strong: W(String.raw`health ?tech|medtech|healthcare (?:company|provider|platform|industry|startup|software|technology)|digital health|телемедицин\p{L}*|medical devices?|pharma\p{L}*|clinical`),
    weak: W(String.raw`clinic|clinics|клінік\p{L}*|клиник\p{L}*|patients?|пацієнт\p{L}*|пациент\p{L}*`),
  },
  edtech: { strong: W(String.raw`ed ?tech|e-learning|online school|онлайн-школ\p{L}*|освітн\p{L}* платформ\p{L}*|образовательн\p{L}* платформ\p{L}*|learning platform`) },
  // Many tech postings mention AI once; a label needs it to be the product (two strong mentions).
  ai: { strong: W(String.raw`ai-first|ai-native|ai startup|llms?|generative ai|genai|machine learning|штучн\p{L}* інтелект\p{L}*|искусственн\p{L}* интеллект\p{L}*|ai agents?|ai platform`), min: 4 },
  adtech: { strong: W(String.raw`ad ?tech|media buy\p{L}*|affiliate marketing|programmatic|арбітраж трафіку|арбитраж трафика`), weak: W(String.raw`advertising|рекламн\p{L}*|affiliate`) },
  logistics: { strong: W(String.raw`logistics|логістик\p{L}*|логистик\p{L}*|supply chain|fleet management|freight`), weak: W(String.raw`warehouse\p{L}*`), min: 4 },
  govtech: { strong: W(String.raw`gov ?tech|diia|дія\.цифров\p{L}*|державн\p{L}* (?:сервіс\p{L}*|підприємств\p{L}*|установ\p{L}*)|government agency|міністерств\p{L}*|министерств\p{L}*`) },
  outsource: {
    strong: W(String.raw`outsourc\p{L}*|outstaff\p{L}*|аутсорс\p{L}*|аутстаф\p{L}*|staff augmentation|for our client|для нашого клієнта|для нашего клиента`),
  },
};

/**
 * Army service is recognised by the employer (a corps, brigade, National Guard, recruiting centre in the company
 * or title) or by text about joining (a military formation, service under contract). Mentions in benefits ("we
 * donate to the army", reservation from mobilisation, "military status" in US EEO notes) do not count.
 */
const ARMY_EMPLOYER = W(
  String.raw`корпус\p{L}*|бригад\p{L}*|батальйон\p{L}*|батальон\p{L}*|полк\p{L}*|нгу|зсу|національн\p{L}* гварді\p{L}*|национальн\p{L}* гварди\p{L}*|сил\p{L}* (?:оборони|безпілотних систем|территориальной обороны|територіальної оборони)|рекрутингов\p{L}* центр\p{L}*|військов\p{L}* частин\p{L}*|азов|штурмов\p{L}*|national guard|armed forces|brigade`,
);
const ARMY_SERVICE = W(
  String.raw`військов\p{L}* формуванн\p{L}*|воинск\p{L}* формировани\p{L}*|служб\p{L}* (?:за|по) контракт\p{L}*|проходженн\p{L}* (?:військової )?служби|прохождени\p{L}* службы|підписанн\p{L}* контракт\p{L}*|у лавах|в рядах (?:всу|зсу)|у складі (?:нгу|зсу|бригади|корпусу|батальйону|сил оборони)|join (?:the )?(?:army|armed forces|brigade|national guard)`,
);
const BRIGADE_WORK = /бригад\p{L}* (?:гпо|монтажник|робітник|будівельник)/giu;

// The patterns are global (for counting): match() ignores lastIndex, test() would not.
const has = (re: RegExp, text: string) => (text.match(re) ?? []).length > 0;

function isArmy(job: { title: string; company?: string | null; descriptionText: string }): boolean {
  const employer = `${job.title}\n${job.company ?? ''}`.replace(BRIGADE_WORK, ' ');
  return has(ARMY_EMPLOYER, employer) || has(ARMY_SERVICE, job.descriptionText);
}

const count = (re: RegExp, text: string) => (text.match(re) ?? []).length;

/** Up to `max` domains, army service first, then by evidence. */
export function detectDomains(job: { title: string; company?: string | null; descriptionText: string }, max = 3): JobDomain[] {
  const text = `${job.title}\n${job.company ?? ''}\n${job.descriptionText}`.slice(0, 20_000);
  const scored = (Object.keys(PATTERNS) as Exclude<JobDomain, 'military'>[])
    .map((d) => {
      const p = PATTERNS[d];
      return { d, points: 2 * count(p.strong, text) + (p.weak ? count(p.weak, text) : 0), min: p.min ?? 2 };
    })
    .filter((x) => x.points >= x.min)
    .sort((a, b) => b.points - a.points)
    .map((x) => x.d as JobDomain);
  return (isArmy(job) ? ['military' as const, ...scored] : scored).slice(0, max);
}
