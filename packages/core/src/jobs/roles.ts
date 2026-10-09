/** Coarse job families used to keep e.g. backend roles out of a frontend/fullstack search. */
export const ROLE_FAMILIES = [
  'frontend',
  'fullstack',
  'backend',
  'mobile',
  'devops',
  'qa',
  'data',
  'design',
  'management',
  'support',
] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

const DEV = String.raw`(developer|engineer|programmer|dev|розробник|разработчик|програміст|программист)`;
/** Letter-aware word boundaries (\b does not work for Cyrillic). */
const W = (body: string) => new RegExp(String.raw`(^|[^\p{L}\p{N}])(${body})($|[^\p{L}\p{N}])`, 'iu');

// Order matters: the first family whose pattern matches wins (fullstack before backend, mobile before frontend…).
const PATTERNS: [RoleFamily, RegExp][] = [
  ['fullstack', W(String.raw`full[\s-]?stack|фулл?[\s-]?стек|фул[\s-]?стек`)],
  ['mobile', W(String.raw`react[\s-]native|ios|android|flutter|mobile|swift(ui)?\s+${DEV}|мобільн\p{L}*|мобильн\p{L}*`)],
  ['frontend', W(String.raw`front[\s-]?end|фронт[\s-]?енд|фронт[\s-]?энд|фронтенд|фронтэнд|(react(\.js)?|vue(\.js)?|angular|svelte|next\.js)\s+${DEV}|react(\.js)?\s*[/,&]`)],
  ['data', W(String.raw`data\s+(scientist|engineer|analyst)|machine\s+learning|ml\s+engineer|analytics\s+engineer|дата[\s-]?сайєнтист`)],
  [
    'backend',
    W(
      String.raw`back[\s-]?end|бек[\s-]?енд|бэк[\s-]?енд|бэкенд|бекенд|server[\s-]side|(node(\.?js)?|nest(\.?js)?|python|java(?!\s*script)|golang|go|php|ruby|rails|scala|elixir|c#|\.net|rust|kotlin)\s+${DEV}`,
    ),
  ],
  ['devops', W(String.raw`devops|dev[\s-]ops|sre|site\s+reliability|platform\s+engineer|infrastructure\s+engineer|cloud\s+engineer|девопс`)],
  ['qa', W(String.raw`qa|sdet|tester|test\s+automation|automation\s+(qa|test)|тестувальник|тестировщик`)],
  ['design', W(String.raw`designer|ui\s*/\s*ux|ux|illustrator|animator|дизайнер`)],
  ['management', W(String.raw`manager|head\s+of|director|cto|vp\s+of|recruiter|product\s+owner|sales|marketing|менеджер|рекрутер`)],
  ['support', W(String.raw`(technical\s+)?support|customer\s+success|help\s*desk|підтримк\p{L}*|поддержк\p{L}*`)],
];

/** "…, not a Full-stack role" / "no backend position" name a family only to rule it out. */
const NEGATED = /(^|[^\p{L}])(not|no|non)[\s-]+(an?\s+)?[\p{L}\p{N}\s/+.#-]{1,30}?\s(role|position|job)(?=$|[^\p{L}])/giu;

function familiesOf(text: string): RoleFamily[] {
  const t = text.replace(NEGATED, ' ');
  return PATTERNS.filter(([, re]) => re.test(t)).map(([family]) => family);
}

/**
 * Every family the title names ("React / React Native Developer" is frontend and mobile), else the AI-normalized
 * role's; empty when both are generic ("Software Engineer") — a generic job is never filtered out by role.
 */
export function detectRoleFamilies(title: string, aiRole?: string | null): RoleFamily[] {
  const fromTitle = familiesOf(title);
  return fromTitle.length > 0 ? fromTitle : aiRole ? familiesOf(aiRole) : [];
}

/** The job's leading family (first by pattern priority), or null for a generic title. */
export function detectRoleFamily(title: string, aiRole?: string | null): RoleFamily | null {
  return detectRoleFamilies(title, aiRole)[0] ?? null;
}

/** Explicit target roles win; otherwise families named by the search keywords ("full stack", "frontend"). */
export function targetRoleFamilies(profile: { targetRoles?: readonly RoleFamily[] | null; keywords: readonly string[] }): RoleFamily[] {
  if (profile.targetRoles && profile.targetRoles.length > 0) return [...new Set(profile.targetRoles)];
  return [...new Set(profile.keywords.flatMap(familiesOf))];
}

/** A job is off-target when it names a family and none of its families is wanted. */
export function roleOffTarget(jobFamilies: readonly RoleFamily[], targets: readonly RoleFamily[]): boolean {
  return targets.length > 0 && jobFamilies.length > 0 && !jobFamilies.some((f) => targets.includes(f));
}
