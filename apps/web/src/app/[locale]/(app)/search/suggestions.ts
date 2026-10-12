import { detectRoleFamilies, keywordForms, type RoleFamily } from '@jp/core';

/**
 * Search keywords per role family, most frequent job-title wording first (measured on 680 front-end / full-stack
 * titles from DOU, Djinni, robota.ua and LinkedIn, Oct 2026): "full stack developer/engineer" 140+, "frontend
 * developer/engineer" 90+, "javascript developer" 25, "react developer" 30 with its spellings, "next.js" rare.
 */
const KEYWORDS: Record<RoleFamily, string[]> = {
  frontend: ['frontend', 'frontend engineer', 'react developer', 'javascript developer', 'angular developer', 'vue developer', 'typescript developer', 'next.js developer'],
  fullstack: ['full stack', 'full stack engineer', 'javascript developer', 'react developer', 'typescript developer', 'software engineer', 'product engineer'],
  backend: ['backend', 'node.js developer', 'python developer', 'java developer', 'golang developer', '.net developer', 'php developer'],
  mobile: ['react native', 'flutter developer', 'ios developer', 'android developer', 'mobile developer'],
  devops: ['devops', 'sre', 'platform engineer', 'cloud engineer'],
  qa: ['qa engineer', 'qa automation', 'manual qa', 'sdet'],
  data: ['data engineer', 'data analyst', 'data scientist', 'machine learning engineer'],
  design: ['product designer', 'ui/ux designer', 'web designer'],
  management: ['project manager', 'product manager', 'engineering manager', 'team lead'],
  support: ['technical support', 'customer success'],
};

/** Popular skills per family; the user's CV skills are shown first. */
const SKILLS: Record<RoleFamily, string[]> = {
  frontend: ['React', 'Next.js', 'TypeScript', 'JavaScript', 'Vue', 'Angular', 'Redux', 'Tailwind', 'HTML', 'CSS', 'Vite', 'Jest', 'Playwright', 'GraphQL'],
  fullstack: ['React', 'Next.js', 'TypeScript', 'Node.js', 'NestJS', 'Express', 'PostgreSQL', 'MongoDB', 'Prisma', 'Docker', 'AWS', 'GraphQL', 'Redis'],
  backend: ['Node.js', 'NestJS', 'Python', 'Django', 'FastAPI', 'Java', 'Spring', 'Go', 'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Kafka', 'Docker', 'Kubernetes', 'AWS'],
  mobile: ['React Native', 'Flutter', 'Swift', 'Kotlin', 'Expo', 'Firebase'],
  devops: ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Azure', 'CI/CD', 'Linux', 'Prometheus'],
  qa: ['Playwright', 'Cypress', 'Selenium', 'Postman', 'Jest', 'API testing'],
  data: ['Python', 'SQL', 'Pandas', 'Spark', 'Airflow', 'dbt', 'PyTorch', 'Power BI'],
  design: ['Figma', 'Design systems', 'Prototyping', 'UX research'],
  management: ['Agile', 'Scrum', 'Jira', 'Roadmapping'],
  support: ['Zendesk', 'Jira', 'SQL'],
};

export const EXCLUDE_SUGGESTIONS = ['php', 'wordpress', '1c', 'gambling', 'betting', 'casino', 'adult', 'crypto', 'unity', 'salesforce', 'sap', 'outstaff', 'unpaid', 'internship'];

export const LOCATION_SUGGESTIONS = ['Київ', 'Львів', 'Харків', 'Дніпро', 'Одеса', 'Warsaw', 'Kraków', 'Berlin', 'Prague', 'Lisbon', 'London', 'Amsterdam'];

/** Monthly USD floor choices for the salary select (null = no minimum). */
export const SALARY_STEPS = [500, 750, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000] as const;

const uniq = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];

export function keywordSuggestions(roles: readonly RoleFamily[]): string[] {
  const families = roles.length > 0 ? roles : (['frontend', 'fullstack', 'backend'] as const);
  return uniq(families.flatMap((f) => KEYWORDS[f]));
}

/** CV skills first (what the user actually has), then the families' popular ones. */
export function skillSuggestions(roles: readonly RoleFamily[], cvSkills: readonly string[]): string[] {
  const families = roles.length > 0 ? roles : (['frontend', 'fullstack'] as const);
  return uniq([...cvSkills, ...families.flatMap((f) => SKILLS[f])]);
}

/** Keywords from a skill the user has: a React developer is also searched as one. */
const SKILL_TITLES: [RegExp, string][] = [
  [/^react(\.?js)?$/i, 'react developer'],
  [/^angular/i, 'angular developer'],
  [/^vue/i, 'vue developer'],
  [/^next(\.?js)?$/i, 'react developer'],
];

/**
 * The best keywords for this user: their CV headline, the most used titles of their roles (checked roles, else the
 * ones the headline names) and titles of their main frameworks. Spellings of one word count once.
 */
export function recommendedKeywords(headline: string | null, roles: readonly RoleFamily[], cvSkills: readonly string[], max = 6): string[] {
  const families = roles.length > 0 ? roles : headline ? detectRoleFamilies(headline) : [];
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (k: string) => {
    const v = k.trim().toLowerCase();
    if (!v || out.length >= max) return;
    const forms = keywordForms(v);
    if (forms.some((f) => seen.has(f))) return;
    forms.forEach((f) => seen.add(f));
    out.push(v);
  };
  if (headline) push(headline);
  for (const f of families) KEYWORDS[f].slice(0, 3).forEach(push);
  for (const skill of cvSkills.slice(0, 10)) {
    const title = SKILL_TITLES.find(([re]) => re.test(skill.trim()))?.[1];
    if (title) push(title);
  }
  return out;
}

/** A profile name from the CV headline and the work format, e.g. "Full-Stack Software Engineer · Remote". */
export function profileNameSuggestion(headline: string | null, formatLabel: string): string | null {
  return headline ? `${headline.trim()} · ${formatLabel}` : null;
}
