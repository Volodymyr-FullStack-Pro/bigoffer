// Manual check against the real provider. Never run in CI. Needs GEMINI_API_KEY_PUBLIC in apps/jobs/.env.
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const { createLlmClient, enrichJob, explainMatches, readAiEnv } = await import('@jp/ai');

const env = readAiEnv();
if (!env.GEMINI_API_KEY_PUBLIC) {
  console.error('Set GEMINI_API_KEY_PUBLIC in apps/jobs/.env (aistudio.google.com/apikey).');
  process.exit(1);
}
const llm = createLlmClient(env);
console.log(`model: ${llm.model('public')}`);

const sample = {
  title: 'Senior Frontend Developer (React)',
  company: 'Acme Payments',
  location: 'Remote — EU timezones',
  salaryRaw: '€4,500–5,500 per month',
  tags: ['react', 'typescript'],
  descriptionText:
    'Acme Payments builds checkout tools for online shops. You will own our React + TypeScript dashboard, work with a Node.js/PostgreSQL backend team, and ship weekly. We hire remotely within the EU and Ukraine. 5+ years with React required; Next.js and Storybook are a plus.',
};

let t = Date.now();
const enriched = await enrichJob(llm, sample);
console.log(JSON.stringify(enriched, null, 2), `\n${Date.now() - t} ms`);

t = Date.now();
const explained = await explainMatches(llm, {
  locale: 'uk',
  criteria: { keywords: ['frontend'], skills: ['React', 'TypeScript'], seniority: ['senior'], remoteType: 'remote', salaryMinUsd: 4000 },
  jobs: [
    {
      id: 'sample',
      title: sample.title,
      company: sample.company,
      summary: enriched.enrichment.summary.en ?? null,
      skills: enriched.enrichment.skills,
      matchedSkills: ['React', 'TypeScript'],
      seniority: enriched.enrichment.seniority,
      remoteType: enriched.enrichment.remoteType,
      location: sample.location,
      salaryMinUsd: enriched.enrichment.salaryMinUsd,
      salaryMaxUsd: enriched.enrichment.salaryMaxUsd,
    },
  ],
});
console.log(explained.explanations.get('sample'), `\n${Date.now() - t} ms`, explained.usage);
