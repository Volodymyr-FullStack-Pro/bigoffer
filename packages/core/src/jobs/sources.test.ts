import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from './job';
import { BOARD_SOURCE_IDS, BROWSER_SOURCE_IDS, defaultSources, SOURCE_CATALOG, sourceInfo } from './sources';

describe('SOURCE_CATALOG', () => {
  it('lists Jobico as a Ukrainian board, off by default', () => {
    expect(sourceInfo('jobico')).toMatchObject({ name: 'Jobico', market: 'ua' });
    expect(defaultSources('office')).not.toContain('jobico');
  });
  it('lists ITLead as a Ukrainian board polled by default', () => {
    expect(sourceInfo('itlead')).toMatchObject({ name: 'ITLead', market: 'ua', url: 'https://itlead.org/vacancies' });
    expect(defaultSources('office')).toContain('itlead');
  });
  it('has exactly one entry per source id', () => {
    expect(SOURCE_CATALOG.map((s) => s.id).sort()).toEqual([...SOURCE_IDS].sort());
  });
  it('marks LinkedIn as beta and Jooble as needing a key', () => {
    expect(sourceInfo('linkedin')?.beta).toBe(true);
    expect(sourceInfo('jooble')?.requiresKey).toBe('JOOBLE_API_KEY');
    expect(sourceInfo('adzuna')?.requiresKey).toBe('ADZUNA_APP_ID');
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
  it('uses every non-beta, non-low-yield board for remote and any', () => {
    const remote = defaultSources('remote');
    expect(remote).toContain('djinni');
    expect(remote).toContain('remotive');
    expect(remote).not.toContain('linkedin');
    expect(defaultSources('any')).toEqual(remote);
  });
  it('marks paywalled apply and lists board sources', () => {
    expect(sourceInfo('remoteok')?.applyPaywall).toBe(true);
    expect(sourceInfo('dou')?.applyPaywall).toBeUndefined();
    expect([...BOARD_SOURCE_IDS].sort()).toEqual(['ashby', 'greenhouse', 'lever', 'telegram', 'workable']);
    expect(defaultSources('remote')).toEqual(expect.arrayContaining(['greenhouse', 'ashby', 'telegram']));
  });
});

describe('lowYield', () => {
  it('keeps low-yield boards out of the defaults but in the catalog', () => {
    const low = ['arbeitnow', 'wwr', 'jobico', 'jobicy', 'justjoin', 'olx'] as const;
    for (const id of low) {
      expect(sourceInfo(id)?.lowYield, id).toBe(true);
      expect(defaultSources('any'), id).not.toContain(id);
    }
    expect(defaultSources('any')).toEqual(expect.arrayContaining(['dou', 'djinni', 'workua', 'robotaua', 'remotive', 'himalayas']));
  });
});
