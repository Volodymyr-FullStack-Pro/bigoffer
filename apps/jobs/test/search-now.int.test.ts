import { afterAll, describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { dueNewQueries, prepareSearchNow } from '../src/pipeline/search-now';
import { syncProfile } from '../src/pipeline/sync-profiles';
import { getProfile } from '../src/pipeline/repository';

const db = getDb();
const uniq = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const now = new Date();
const later = new Date(now.getTime() + 3 * 3600_000).toISOString();
let userId = '';

afterAll(async () => {
  if (userId) await db.auth.admin.deleteUser(userId);
});

describe('prepareSearchNow', () => {
  it("pulls the user's queries forward and returns them as due, skipping paused sources", async () => {
    const { data: user, error } = await db.auth.admin.createUser({ email: `search-now-${uniq}@e2e.test`, email_confirm: true });
    if (error) throw error;
    userId = user.user.id;
    const { error: spErr } = await db
      .from('search_profiles')
      .insert({ user_id: userId, name: 'Now', keywords: [`zz${uniq}`], skills: [], remote_type: 'remote', sources: ['robotaua', 'djinni'] });
    if (spErr) throw spErr;
    const { data: before } = await db.from('sources').select('id, enabled, paused_until').in('id', ['robotaua', 'djinni']);
    await db.from('sources').update({ enabled: true, paused_until: null }).eq('id', 'robotaua');
    await db.from('sources').update({ enabled: true, paused_until: later }).eq('id', 'djinni');
    try {
      const first = await prepareSearchNow(db, userId, now);
      expect(first.profiles).toBe(1);
      const ids = first.due.map((q) => q.id);
      const { data: queries } = await db.from('search_queries').select('id, source_id, next_run_at, query_key').in('id', ids);
      expect(new Set(queries!.map((q) => q.source_id))).toEqual(new Set(['robotaua']));
      expect(queries!.every((q) => new Date(q.next_run_at).getTime() <= now.getTime())).toBe(true);

      // A query scheduled for later is brought forward to now.
      await db.from('search_queries').update({ next_run_at: later }).in('id', ids);
      const second = await prepareSearchNow(db, userId, now);
      expect(second.due.map((q) => q.nextRunAt)).toEqual(ids.map(() => now.toISOString()));
    } finally {
      for (const s of before ?? []) await db.from('sources').update({ enabled: s.enabled, paused_until: s.paused_until }).eq('id', s.id);
    }
  });

  it('does nothing for a user without active profiles', async () => {
    const { data: user, error } = await db.auth.admin.createUser({ email: `search-none-${uniq}@e2e.test`, email_confirm: true });
    if (error) throw error;
    try {
      expect(await prepareSearchNow(db, user.user.id, now)).toEqual({ profiles: 0, due: [] });
    } finally {
      await db.auth.admin.deleteUser(user.user.id);
    }
  });
});

describe('dueNewQueries', () => {
  it('returns only queries that never ran, pulled forward to now', async () => {
    const { data: user, error } = await db.auth.admin.createUser({ email: `save-new-${uniq}@e2e.test`, email_confirm: true });
    if (error) throw error;
    try {
      const { data: sp, error: spErr } = await db
        .from('search_profiles')
        .insert({ user_id: user.user.id, name: 'Save', keywords: [`yy${uniq}`, `ww${uniq}`], skills: [], remote_type: 'remote', sources: ['robotaua'] })
        .select('id')
        .single();
      if (spErr) throw spErr;
      await db.from('sources').update({ enabled: true, paused_until: null }).eq('id', 'robotaua');
      const { queryIds } = await syncProfile(db, (await getProfile(db, sp.id))!, now);
      const { data: rows } = await db.from('search_queries').select('id, query_key').in('id', queryIds).eq('source_id', 'robotaua');
      const ran = rows!.find((r) => r.query_key.includes(`yy${uniq}`))!;
      // One keyword's query already ran and is scheduled later; the other is brand new.
      await db.from('search_queries').update({ last_run_at: now.toISOString(), next_run_at: later }).eq('id', ran.id);
      await db.from('search_queries').update({ next_run_at: later }).in('id', rows!.filter((r) => r.id !== ran.id).map((r) => r.id));
      const due = await dueNewQueries(db, queryIds, now);
      const dueIds = due.map((q) => q.id);
      expect(dueIds).not.toContain(ran.id);
      expect(dueIds.length).toBeGreaterThan(0);
      expect(due.every((q) => q.nextRunAt === now.toISOString())).toBe(true);
    } finally {
      await db.auth.admin.deleteUser(user.user.id);
    }
  });
});
