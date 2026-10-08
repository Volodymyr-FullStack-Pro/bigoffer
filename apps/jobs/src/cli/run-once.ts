import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local' });

const { getDb } = await import('../db');
const { discoverBoards } = await import('../pipeline/boards');
const { getDueQueryIds } = await import('../pipeline/repository');
const { runQuery } = await import('../pipeline/run-query');
const { syncAllProfiles } = await import('../pipeline/sync-profiles');
const { pipelineDeps } = await import('../runtime');

const force = process.argv.includes('--force');
const discover = process.argv.includes('--discover');
const onlySource = process.argv.find((a) => a.startsWith('--source='))?.split('=')[1];

const db = getDb();
const now = new Date();
console.log(`profiles synced: ${await syncAllProfiles(db, now)}`);

if (force) {
  await db.from('search_queries').update({ next_run_at: now.toISOString() }).gte('next_run_at', '1970-01-01');
}
const due = (await getDueQueryIds(db, now)).filter((q) => !onlySource || q.sourceId === onlySource);
console.log(`queries due: ${due.length}`);

const deps = pipelineDeps();
for (const q of due) {
  try {
    const r = await runQuery(deps, q.id);
    console.log(`${q.sourceId.padEnd(10)} ${r.status.padEnd(8)} found=${r.found} new=${r.inserted} matched=${r.matched}${r.alert ? `  ⚠ ${r.alert}` : ''}`);
  } catch (err) {
    console.error(`${q.sourceId.padEnd(10)} error    ${err instanceof Error ? err.message : err}`);
  }
}

if (discover) {
  console.log(`board discovery: ${JSON.stringify(await discoverBoards(db, deps))}`);
}
