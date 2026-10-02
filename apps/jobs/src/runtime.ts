import { ADAPTERS, createHttpContext } from '@jp/scrapers';
import { getDb } from './db';
import { jobsEnv } from './env';
import type { RunQueryDeps } from './pipeline/run-query';

export function pipelineDeps(): RunQueryDeps {
  const env = jobsEnv();
  const adapterEnv = { JOOBLE_API_KEY: env.JOOBLE_API_KEY };
  return {
    db: getDb(),
    adapters: ADAPTERS,
    env: adapterEnv,
    createContext: () => createHttpContext({ userAgent: env.SCRAPER_USER_AGENT }, adapterEnv),
  };
}
