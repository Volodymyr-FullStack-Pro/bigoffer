import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from './job';
import { BROWSER_SOURCE_IDS, defaultSources, SOURCE_CATALOG, sourceInfo } from './sources';

describe('SOURCE_CATALOG', () => {
  it('lists Jobico as a Ukrainian board polled by default', () => {
    expect(sourceInfo('jobico')).toMatchObject({ name: 'Jobico', market: 'ua' });
    expect(defaultSources('office')).toContain('jobico');
  });
  it('has exactly one entry per source id', () => {
    expect(SOURCE_CATALOG.map((s) => s.id).sort()).toEqual([...SOURCE_IDS].sort());
  });
  it('marks LinkedIn as beta and Jooble as needing a key', () => {
    expect(sourceInfo('linkedin')?.beta).toBe(true);
    expect(sourceInfo('jooble')?.requiresKey).toBe('JOOBLE_API_KEY');
    expect(sourceInfo('nope')).toBeUndefined();
  });
  it('lists browser sources', () => {
    expect([...BROWSER_SOURCE_IDS].sort()).toEqual(['olx', 'workua']);
  });
});

describe('defaultSources', () => {
  it('uses Ukrainian and global boards for office/hybrid', () => {
    const office = defaultSources('office');
    expect(office).toContain('workua');
    expect(office).toContain('jooble');
    expect(office).not.toContain('remoteok');
    expect(office).not.toContain('linkedin');
    expect(defaultSources('hybrid')).toEqual(office);
  });
  it('uses every non-beta board for remote and any', () => {
    const remote = defaultSources('remote');
    expect(remote).toContain('djinni');
    expect(remote).toContain('justjoin');
    expect(remote).not.toContain('linkedin');
    expect(defaultSources('any')).toEqual(remote);
  });
});
