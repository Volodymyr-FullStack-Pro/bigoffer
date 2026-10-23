import { matchBankKey, textLang } from '@jp/core';

export type AutofillProfile = {
  fullName: string | null;
  contacts: Partial<Record<'email' | 'phone' | 'linkedin' | 'github' | 'portfolio' | 'telegram' | 'cv', string>>;
  bank: { key: string; answer: Record<string, string> }[];
};

/** A form field as the extension sees it: its label text (label, aria-label, placeholder or name) and input type. */
export type AutofillField = { label: string; type: string };

const FIELDS: [RegExp, (p: AutofillProfile) => string | null | undefined][] = [
  [/e-?mail|пошт|почт/i, (p) => p.contacts.email],
  [/phone|tel\b|mobile|телефон|номер/i, (p) => p.contacts.phone],
  [/linkedin/i, (p) => p.contacts.linkedin],
  [/github/i, (p) => p.contacts.github],
  [/telegram|телеграм/i, (p) => p.contacts.telegram],
  [/portfolio|website|personal site|сайт|портфол/i, (p) => p.contacts.portfolio],
  [/\bcv\b|resume|резюме/i, (p) => p.contacts.cv],
  [/first.?name|given name|^ім'?я$|^имя$|^name$/i, (p) => p.fullName?.split(/\s+/)[0]],
  [/last.?name|surname|family name|прізвище|фамилия/i, (p) => p.fullName?.split(/\s+/).slice(1).join(' ') || null],
  [/full.?name|your name|name and surname|піб|фио|ім'?я та прізвище|имя и фамилия/i, (p) => p.fullName],
];

/**
 * The value for each form field, or null to leave it alone: contacts by what the label asks for, then the answer bank
 * for typical questions (salary, start date, English, format, why looking) in the question's language.
 */
export function autofill(fields: readonly AutofillField[], p: AutofillProfile): (string | null)[] {
  return fields.map(({ label, type }) => {
    const text = label.trim().slice(0, 300);
    if (type === 'password' || type === 'file') return null;
    if (type === 'email') return p.contacts.email ?? null;
    if (type === 'tel') return p.contacts.phone ?? null;
    if (!text) return null;
    for (const [re, get] of FIELDS) if (re.test(text)) return get(p)?.trim() || null;
    const key = matchBankKey(text);
    const row = key ? p.bank.find((b) => b.key === key) : undefined;
    return row ? (row.answer[textLang(text)] || row.answer.en || null) : null;
  });
}
