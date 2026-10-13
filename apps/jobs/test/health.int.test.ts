import type { BotApi } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { getDb } from '../src/db';
import { checkHealth, evaluateHealth, type SourceHealthRow } from '../src/pipeline/health';

const now = new Date('2026-10-13T12:00:00Z');
const healthy = (source_id: string, over: Partial<SourceHealthRow> = {}): SourceHealthRow => ({
  source_id,
  runs_6h: 12,
  ok_runs_6h: 12,
  blocked_runs_6h: 0,
  found_6h: 300,
  last_ok_run_at: new Date(now.getTime() - 20 * 60_000).toISOString(),
  new_jobs_24h: 60,
  pct_company: 100,
  pct_description: 98,
  pct_posted: 100,
  pct_location: 95,
  pct_salary: 25,
  newest_posted_at: now.toISOString(),
  ...over,
});

describe('evaluateHealth', () => {
  it('is quiet for healthy boards', () => {
    expect(evaluateHealth([healthy('dou'), healthy('djinni'), healthy('robotaua')], 0, now)).toEqual([]);
  });

  it('flags a board that stopped, finds nothing or is blocked', () => {
    const issues = evaluateHealth(
      [
        healthy('dou', { last_ok_run_at: new Date(now.getTime() - 5 * 3600_000).toISOString() }),
        healthy('djinni', { found_6h: 0 }),
        healthy('robotaua', { blocked_runs_6h: 3, last_ok_run_at: null }),
      ],
      0,
      now,
    ).map((i) => i.key);
    expect(issues).toEqual(['dou:stopped', 'djinni:empty', 'robotaua:stopped', 'robotaua:blocked']);
  });

  it('flags fields that went missing (the DOU salary that landed in the location)', () => {
    const issues = evaluateHealth([healthy('dou', { pct_salary: 0, pct_location: 40, pct_company: 50 })], 0, now);
    expect(issues.map((i) => i.key)).toEqual(['dou:company', 'dou:location', 'dou:salary']);
    expect(issues[2]!.text).toBe('dou: salary on 0% of new jobs (expected ≥ 2%)');
  });

  it('ignores shares on a quiet day and flags a stuck enrichment', () => {
    expect(evaluateHealth([healthy('djinni', { new_jobs_24h: 5, pct_company: 0, pct_salary: 0 })], 11, now).map((i) => i.key)).toEqual([
      'ai:enrich-backlog',
    ]);
  });
});

describe('checkHealth', () => {
  it('reads the snapshot and alerts the owner once a day per problem', async () => {
    const db = getDb();
    const sent: string[] = [];
    const bot: BotApi = {
      sendMessage: async (_chat, text) => {
        sent.push(text);
        return { ok: true };
      },
      answerCallback: async () => ({ ok: true }),
      clearButtons: async () => ({ ok: true }),
    };
    // Far in the future: no runs in the window, so every enabled board reads as stopped.
    const later = new Date(Date.now() + 30 * 24 * 3600_000);
    await db.from('health_alerts').delete().like('key', '%:stopped');
    const first = await checkHealth(db, { now: later, bot, ownerChatId: 1 });
    expect(first.issues.some((i) => i.key === 'dou:stopped')).toBe(true);
    expect(first.alerted).toBeGreaterThan(0);
    const second = await checkHealth(db, { now: new Date(later.getTime() + 3600_000), bot, ownerChatId: 1 });
    expect(second.alerted).toBe(0);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('dou: no successful run');
    await db.from('health_alerts').delete().like('key', '%:stopped');
  });
});
