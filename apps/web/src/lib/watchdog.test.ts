import { describe, expect, it } from 'vitest';
import { watchdogIssues } from './watchdog';

describe('watchdogIssues', () => {
  const now = new Date('2026-10-20T09:00:00Z');
  it('is quiet while scraping runs', () => {
    expect(watchdogIssues({ lastOkRunAt: '2026-10-20T08:20:00Z', now })).toEqual([]);
  });
  it('reports a stopped worker with the hours since the last run', () => {
    const issues = watchdogIssues({ lastOkRunAt: '2026-10-18T04:25:00Z', now });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('52 год');
    expect(issues[0]).toContain('Trigger.dev');
  });
  it('reports a worker that never ran', () => {
    expect(watchdogIssues({ lastOkRunAt: null, now })).toHaveLength(1);
  });
});
