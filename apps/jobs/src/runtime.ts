import { BROWSER_SOURCE_IDS, type SourceId } from '@jp/core';
import { ADAPTERS, createHttpContext, createPlaywrightRenderer } from '@jp/scrapers';
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
    createContext: (sourceId) =>
      createHttpContext(
        { userAgent: env.SCRAPER_USER_AGENT },
        adapterEnv,
        BROWSER_SOURCE_IDS.has(sourceId as SourceId)
          ? () => createPlaywrightRenderer({ userAgent: env.SCRAPER_USER_AGENT })
          : undefined,
      ),
  };
}
