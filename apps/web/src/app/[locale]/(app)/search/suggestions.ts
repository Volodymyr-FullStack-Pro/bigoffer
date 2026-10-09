import type { RoleFamily } from '@jp/core';

/** Search keywords people actually use per role family (job-title words, not skills). */
const KEYWORDS: Record<RoleFamily, string[]> = {
  frontend: ['frontend', 'react developer', 'next.js developer', 'vue developer', 'angular developer', 'javascript developer', 'typescript developer'],
  fullstack: ['full stack', 'node.js developer', 'javascript developer', 'typescript developer', 'react developer'],
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
