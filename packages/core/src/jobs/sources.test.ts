import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from './job';
import { BOARD_SOURCE_IDS, BROWSER_SOURCE_IDS, defaultSources, MAIN_SOURCE_IDS, PRIORITY_SOURCE_IDS, SOURCE_CATALOG, sourceInfo } from './sources';

describe('SOURCE_CATALOG', () => {
  it('lists ITLead as a Ukrainian board', () => {
    expect(sourceInfo('itlead')).toMatchObject({ name: 'ITLead', market: 'ua', url: 'https://itlead.org/vacancies' });
  });
  it('has exactly one entry per source id', () => {
    expect(SOURCE_CATALOG.map((s) => s.id).sort()).toEqual([...SOURCE_IDS].sort());
  });
  it('treats LinkedIn as a regular board and marks keyed sources', () => {
    expect(sourceInfo('linkedin')?.beta).toBeUndefined();
    expect(sourceInfo('jooble')?.requiresKey).toBe('JOOBLE_API_KEY');
    expect(sourceInfo('nope')).toBeUndefined();
  });
  it('lists browser sources', () => {
    expect([...BROWSER_SOURCE_IDS].sort()).toEqual(['workua']);
  });
});

describe('defaultSources', () => {
  it('is the four Ukrainian main boards for every work format', () => {
    for (const r of ['any', 'remote', 'hybrid', 'office'] as const) {
      expect(defaultSources(r)).toEqual(['dou', 'djinni', 'robotaua', 'workua']);
    }
    expect(defaultSources('any')).not.toBe(MAIN_SOURCE_IDS);
  });
  it('polls the main boards on their own cadence', () => {
    expect([...PRIORITY_SOURCE_IDS].sort()).toEqual([...MAIN_SOURCE_IDS].sort());
  });
  it('marks paywalled apply and lists board sources', () => {
    expect(sourceInfo('remoteok')?.applyPaywall).toBe(true);
    expect(sourceInfo('dou')?.applyPaywall).toBeUndefined();
    expect([...BOARD_SOURCE_IDS].sort()).toEqual(['ashby', 'greenhouse', 'lever', 'telegram', 'workable']);
  });
});

describe('lowYield', () => {
  it('flags boards that rarely yield good matches', () => {
    for (const id of ['jooble', 'remoteok'] as const) {
      expect(sourceInfo(id)?.lowYield, id).toBe(true);
    }
    for (const id of MAIN_SOURCE_IDS) expect(sourceInfo(id)?.lowYield, id).toBeUndefined();
  });
});
