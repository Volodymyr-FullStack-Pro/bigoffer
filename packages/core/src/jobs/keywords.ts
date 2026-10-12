/**
 * Spellings of the same role word. A keyword containing one form ("frontend developer") also stands for the others
 * ("front-end developer", "фронтенд"), in search queries and in matching, so no posting slips through on spelling.
 */
const GROUPS: { latin: string[]; local: string[]; related?: string[] }[] = [
  { latin: ['full stack', 'fullstack', 'full-stack'], local: ['фулстек', 'фуллстек', 'фул стек'] },
  // Markup (HTML/CSS layout) is front-end work too: a front-end search must not miss "Верстальник" postings.
  { latin: ['frontend', 'front-end', 'front end'], local: ['фронтенд', 'фронт-енд', 'фронтэнд'], related: ['markup', 'верстальник', 'html/css'] },
  { latin: ['backend', 'back-end', 'back end'], local: ['бекенд', 'бэкенд', 'бек-енд'] },
];

const lower = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function groupOf(keyword: string) {
  const k = lower(keyword);
  for (const g of GROUPS) {
    const form = [...g.latin, ...g.local].find((f) => new RegExp(`(^|[^\\p{L}])${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(k));
    if (form) return { group: g, form, k };
  }
  return null;
}

/** Every spelling of a keyword for matching job text: itself, the same phrase with each other form, related terms. */
export function keywordForms(keyword: string): string[] {
  const hit = groupOf(keyword);
  if (!hit) return [lower(keyword)];
  const { group, form, k } = hit;
  const out = new Set<string>([k]);
  for (const other of [...group.latin, ...group.local]) out.add(k.replace(form, other));
  for (const r of group.related ?? []) out.add(r);
  return [...out];
}

/**
 * Extra search terms a keyword brings to keyword-searching boards: the other Latin spellings of the phrase, and the
 * bare local (Cyrillic) word that Ukrainian titles use ("Front-end розробник", "Фронтенд-розробник").
 */
export function keywordSearchVariants(keyword: string): string[] {
  const hit = groupOf(keyword);
  if (!hit) return [];
  const { group, form, k } = hit;
  const out: string[] = [];
  for (const other of group.latin) if (other !== form) out.push(k.replace(form, other));
  out.push(group.local[0]!);
  return out.filter((v) => v !== k);
}

/** Whether a keyword names front-end work (so markup categories are worth searching too). */
export function isFrontendKeyword(keyword: string): boolean {
  return groupOf(keyword)?.group === GROUPS[1];
}
