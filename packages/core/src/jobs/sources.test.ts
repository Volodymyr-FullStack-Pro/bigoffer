import { describe, expect, it } from 'vitest';
import { SOURCE_IDS } from './job';
import { defaultSources, MAIN_SOURCE_IDS, SOURCE_CATALOG, sourceInfo } from './sources';

describe('SOURCE_CATALOG', () => {
  it('has exactly one entry per source id', () => {
    expect(SOURCE_CATALOG.map((s) => s.id).sort()).toEqual([...SOURCE_IDS].sort());
    expect(sourceInfo('robotaua')).toMatchObject({ name: 'robota.ua', url: 'https://robota.ua' });
    expect(sourceInfo('nope')).toBeUndefined();
  });
});

describe('defaultSources', () => {
  it('is the three Ukrainian boards for every work format', () => {
    for (const r of ['any', 'remote', 'hybrid', 'office'] as const) {
      expect(defaultSources(r)).toEqual(['dou', 'djinni', 'robotaua']);
    }
    expect(defaultSources('any')).not.toBe(MAIN_SOURCE_IDS);
  });
});
