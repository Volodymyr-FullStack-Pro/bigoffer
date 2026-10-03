import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const { enrichJobs } = await import('../pipeline/enrich');
const { aiDeps } = await import('../runtime');

const limitArg = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1]);
const deps = aiDeps();
const batchSize = Number.isInteger(limitArg) && limitArg > 0 ? limitArg : deps.batchSize;

const result = await enrichJobs({ ...deps, batchSize, timeBudgetMs: Number.POSITIVE_INFINITY });
console.log(`enrichment: ${JSON.stringify(result)}`);
