export const BANK_KEYS = ['salary', 'start_date', 'english', 'why_looking', 'work_format'] as const;
export type BankKey = (typeof BANK_KEYS)[number];

const MAX_QUESTIONS = 20;
const LEADER = /^\s*(?:\d+[.)]|[-*•])\s*/;

/** Questions from a pasted application form: numbered/bulleted lines, lines ending in "?" or ":". */
export function splitQuestions(text: string): string[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 1) return [lines[0]!.replace(LEADER, '').slice(0, 300)];
  const out: string[] = [];
  for (const line of lines) {
    const listed = LEADER.test(line);
    const q = line.replace(LEADER, '').trim();
    if (!q || q.length > 300) continue;
    if (listed || /[?:]$/.test(q)) out.push(q);
    if (out.length >= MAX_QUESTIONS) break;
  }
  return out;
}

const PATTERNS: [BankKey, RegExp][] = [
  ['salary', /salary|compensation|rate expectation|зарплат|заробітн|оплат|вилк|вилоч|ставк/i],
  ['start_date', /when can you start|start date|notice period|available to start|приступ|почат(?:и|ок) робот|вийти на робот|выйти на работ|готов(?:і|ы)? (?:почати|начать)/i],
  ['english', /english|англ/i],
  ['why_looking', /why .*(?:looking|leav|chang)|reason for (?:leaving|change)|чому .*(?:шука|зміню|йде)|почему .*(?:ищ|меня|уход)/i],
  ['work_format', /remote|office|hybrid|on-?site|віддален|дистанц|удал[её]н|офіс|офис|гібрид|гибрид|формат роботи|формат работы/i],
];

/** The answer-bank key a typical form question maps to, or null when it needs a tailored answer. */
export function matchBankKey(question: string): BankKey | null {
  return PATTERNS.find(([, re]) => re.test(question))?.[0] ?? null;
}
