import { detectRoleFamilies, keywordForms, type RoleFamily } from '@jp/core';
import { skillKey } from '../today/card-skills';

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

/**
 * Skills offered per role family, most asked first. Front-end, full-stack and back-end follow how often the skill
 * appears in the jobs BigOffer scraped (Oct 2026: 579 postings, e.g. full-stack React 203, TypeScript 185, Node.js
 * 112, PostgreSQL 103); the other families, with too few postings yet, follow their usual stacks. The user's CV
 * skills are always shown first.
 */
const SKILLS: Record<RoleFamily, string[]> = {
  frontend: ['React', 'TypeScript', 'JavaScript', 'Next.js', 'HTML', 'CSS', 'Redux', 'Redux Toolkit', 'Git', 'REST API', 'GraphQL', 'Angular', 'Vue.js', 'Node.js', 'Tailwind CSS', 'SCSS', 'Figma', 'Jest', 'Playwright', 'Cypress', 'Testing Library', 'Vite', 'Webpack', 'Zustand', 'MobX', 'React Query', 'Storybook', 'React Native', 'Material UI', 'Styled Components', 'Svelte', 'Nuxt', 'RxJS', 'Web Performance', 'Accessibility', 'PWA', 'WebSockets', 'i18n', 'SEO', 'CI/CD', 'Docker', 'AWS'],
  fullstack: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'JavaScript', 'Next.js', 'Docker', 'AWS', 'Python', 'NestJS', 'Express', 'REST API', 'GraphQL', 'SQL', 'MongoDB', 'Redis', 'Angular', 'Vue.js', 'Git', 'CI/CD', 'Kubernetes', 'Azure', 'GCP', 'Prisma', 'TypeORM', 'Tailwind CSS', 'Jest', 'Playwright', 'Microservices', 'Kafka', 'RabbitMQ', 'Django', 'FastAPI', 'Java', '.NET', 'C#', 'Go', 'Terraform', 'Supabase', 'Firebase', 'Vercel', 'Stripe', 'WebSockets'],
  backend: ['Node.js', 'TypeScript', 'PostgreSQL', 'AWS', 'Docker', 'Python', 'Java', 'Go', 'C#', '.NET', 'Spring', 'NestJS', 'Express', 'Django', 'FastAPI', 'Redis', 'Kubernetes', 'SQL', 'MySQL', 'MongoDB', 'REST API', 'GraphQL', 'gRPC', 'Microservices', 'Kafka', 'RabbitMQ', 'Elasticsearch', 'CI/CD', 'Terraform', 'Azure', 'GCP', 'Linux', 'Prisma', 'TypeORM', 'PHP', 'Laravel', 'Ruby on Rails', 'Rust', 'Scala'],
  mobile: ['React Native', 'Flutter', 'Dart', 'Swift', 'SwiftUI', 'Kotlin', 'Jetpack Compose', 'Java', 'Objective-C', 'Expo', 'TypeScript', 'Firebase', 'Redux', 'MobX', 'REST API', 'GraphQL', 'Xcode', 'Android SDK', 'iOS SDK', 'Core Data', 'Room', 'Fastlane', 'App Store', 'Google Play', 'Push Notifications', 'In-App Purchases', 'Detox', 'Appium', 'CI/CD', 'Git'],
  devops: ['Docker', 'Kubernetes', 'Terraform', 'AWS', 'GCP', 'Azure', 'CI/CD', 'GitHub Actions', 'GitLab CI', 'Jenkins', 'ArgoCD', 'Helm', 'Ansible', 'Linux', 'Bash', 'Python', 'Go', 'Prometheus', 'Grafana', 'ELK', 'Datadog', 'Nginx', 'Istio', 'Vault', 'CloudFormation', 'Pulumi', 'Networking', 'SRE', 'PostgreSQL', 'Redis', 'Kafka'],
  qa: ['Manual Testing', 'Test Automation', 'Playwright', 'Cypress', 'Selenium', 'WebdriverIO', 'Appium', 'Postman', 'API Testing', 'REST Assured', 'JavaScript', 'TypeScript', 'Java', 'Python', 'Jest', 'Mocha', 'Cucumber', 'BDD', 'TestRail', 'Jira', 'SQL', 'CI/CD', 'GitHub Actions', 'Jenkins', 'JMeter', 'k6', 'Load Testing', 'Charles Proxy', 'Mobile Testing', 'Regression Testing', 'Test Design', 'Allure', 'Docker', 'Git'],
  data: ['Python', 'SQL', 'Pandas', 'NumPy', 'Spark', 'PySpark', 'Airflow', 'dbt', 'Kafka', 'Snowflake', 'BigQuery', 'Redshift', 'Databricks', 'PostgreSQL', 'Power BI', 'Tableau', 'Looker', 'Machine Learning', 'scikit-learn', 'PyTorch', 'TensorFlow', 'LLM', 'NLP', 'Statistics', 'A/B Testing', 'ETL', 'Data Modeling', 'Excel', 'R', 'Jupyter', 'MLflow', 'AWS', 'GCP'],
  design: ['Figma', 'UI Design', 'UX Design', 'Prototyping', 'Design Systems', 'User Research', 'Wireframing', 'Usability Testing', 'Adobe XD', 'Sketch', 'Photoshop', 'Illustrator', 'After Effects', 'Motion Design', 'Web Design', 'Mobile Design', 'Interaction Design', 'Information Architecture', 'Accessibility', 'Typography', 'Framer', 'Webflow', 'Miro', 'Design Thinking', 'HTML', 'CSS'],
  management: ['Agile', 'Scrum', 'Kanban', 'Jira', 'Confluence', 'Roadmapping', 'Stakeholder Management', 'Product Discovery', 'Analytics', 'A/B Testing', 'OKR', 'SQL', 'Risk Management', 'Budgeting', 'Team Leadership', 'People Management', 'Hiring', 'PRD', 'User Stories', 'Prioritization', 'SAFe', 'Notion', 'Miro', 'Amplitude', 'Mixpanel', 'Google Analytics'],
  support: ['Zendesk', 'Jira', 'Intercom', 'Freshdesk', 'Salesforce', 'HubSpot', 'SQL', 'Customer Success', 'Technical Support', 'Troubleshooting', 'ITIL', 'Helpdesk', 'Linux', 'Networking', 'REST API', 'Postman', 'Confluence', 'CRM', 'Communication'],
};

export const EXCLUDE_SUGGESTIONS = ['php', 'wordpress', '1c', 'gambling', 'betting', 'casino', 'adult', 'crypto', 'unity', 'salesforce', 'sap', 'outstaff', 'unpaid', 'internship'];

export const LOCATION_SUGGESTIONS = ['Київ', 'Львів', 'Харків', 'Дніпро', 'Одеса', 'Warsaw', 'Kraków', 'Berlin', 'Prague', 'Lisbon', 'London', 'Amsterdam'];

/** Monthly USD floor choices for the salary select (null = no minimum). */
export const SALARY_STEPS = [500, 750, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000, 6000, 7000, 8000] as const;

const uniq = (xs: string[]) => [...new Map(xs.map((x) => [x.toLowerCase(), x])).values()];

/** All titles of the user's roles, then titles of their own frameworks (CV or profile skills). */
export function keywordSuggestions(roles: readonly RoleFamily[], skills: readonly string[] = []): string[] {
  const families = roles.length > 0 ? roles : (['frontend', 'fullstack', 'backend'] as const);
  return uniq([...families.flatMap((f) => KEYWORDS[f]), ...skillTitles(skills)]);
}

/** CV skills first (what the user actually has), then the families' popular ones. */
/**
 * CV skills first, then the families' skills interleaved by rank (the top of each role before the long tail), with
 * spelling variants counted once (Tailwind = Tailwind CSS, React.js = React).
 */
export function skillSuggestions(roles: readonly RoleFamily[], cvSkills: readonly string[], demandSkills: readonly string[] = []): string[] {
  const families = roles.length > 0 ? roles : (['frontend', 'fullstack'] as const);
  const lists = families.map((f) => SKILLS[f]);
  const interleaved: string[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) interleaved.push(l[i]!);
  const seen = new Set<string>();
  // CV skills, then what the user's own matches ask for most, then the roles' usual stacks.
  return [...cvSkills, ...demandSkills, ...interleaved].filter((s) => {
    const k = skillKey(s);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Keywords from a skill the user has: a React developer is also searched as one. */
const SKILL_TITLES: [RegExp, string[]][] = [
  [/^react(\.?js)?$/i, ['react developer', 'frontend developer']],
  [/^next(\.?js)?$/i, ['next.js developer', 'react developer']],
  [/^(typescript|ts)$/i, ['typescript developer']],
  [/^(javascript|js)$/i, ['javascript developer']],
  [/^node(\.?js)?$/i, ['node.js developer', 'backend developer']],
  [/^nest(\.?js)?$/i, ['node.js developer']],
  [/^angular/i, ['angular developer']],
  [/^vue/i, ['vue developer']],
  [/^react native$/i, ['react native developer', 'mobile developer']],
  [/^python$/i, ['python developer']],
  [/^(openai|anthropic)/i, ['ai engineer']],
];

const skillTitles = (skills: readonly string[]) => skills.flatMap((s) => SKILL_TITLES.find(([re]) => re.test(s.trim()))?.[1] ?? []);

/** A CV headline also searched in its common spellings: "Full Stack Developer" → full stack engineer, full stack. */
function headlineVariants(headline: string): string[] {
  const h = headline.toLowerCase();
  if (/full[\s-]?stack/.test(h)) return ['full stack developer', 'full stack engineer', 'full stack'];
  if (/front[\s-]?end/.test(h)) return ['frontend developer', 'frontend engineer', 'frontend'];
  if (/back[\s-]?end/.test(h)) return ['backend developer', 'backend engineer'];
  return [];
}

/**
 * The best keywords for this user: their CV headline, the most used titles of their roles (checked roles, else the
 * ones the headline names) and titles of their main frameworks. Spellings of one word count once.
 */
export function recommendedKeywords(headline: string | null, roles: readonly RoleFamily[], cvSkills: readonly string[], max = 8, chosen: readonly string[] = []): string[] {
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
  // Boards search by text: a chosen "full stack" already finds "Full Stack Engineer", so that is not recommended.
  const words = (k: string) => ` ${k.toLowerCase().replace(/[^\p{L}\p{N}.+#]+/gu, ' ').trim()} `;
  const coveredBy = chosen.flatMap(keywordForms).map(words);
  const pushNew = (k: string) => {
    if (!coveredBy.some((c) => words(k).includes(c))) push(k);
  };
  if (headline) [headline, ...headlineVariants(headline)].forEach(pushNew);
  for (const f of families) KEYWORDS[f].slice(0, 5).forEach(pushNew);
  skillTitles(cvSkills.slice(0, 20)).forEach(pushNew);
  return out;
}

/** A profile name from the CV headline and the work format, e.g. "Full-Stack Software Engineer · Remote". */
export function profileNameSuggestion(headline: string | null, formatLabel: string): string | null {
  return headline ? `${headline.trim()} · ${formatLabel}` : null;
}
