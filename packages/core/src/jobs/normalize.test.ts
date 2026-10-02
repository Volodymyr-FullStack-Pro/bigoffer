import { describe, expect, it } from 'vitest';
import { fingerprint, normalizeCompany, normalizeTitle, regionBucket } from './normalize';

describe('normalizeCompany', () => {
  it('drops legal suffixes, quotes and punctuation', () => {
    expect(normalizeCompany('"ІНФОТЕХ" ТОВ')).toBe('інфотех');
    expect(normalizeCompany('Acme, Inc.')).toBe('acme');
    expect(normalizeCompany('Bjak ')).toBe('bjak');
  });
});

describe('entities and unicode forms', () => {
  it('decodes guillemet entities in company names', () => {
    expect(normalizeCompany('&laquo;Інфотех&raquo;')).toBe('інфотех');
  });
  it('treats decomposed and composed й as equal', () => {
    expect(normalizeTitle('Розробни\u0438\u0306к')).toBe(normalizeTitle('Розробни\u0439к'));
    expect(normalizeTitle('Йога')).toBe(normalizeTitle('\u0418\u0306ога'));
  });
});

describe('normalizeTitle', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeTitle('Senior Front-End Developer (React + TS)!')).toBe('senior front end developer react ts');
  });
});

describe('regionBucket', () => {
  it('returns remote for remote jobs', () => {
    expect(regionBucket('Kyiv', 'remote')).toBe('remote');
  });
  it('maps city spellings to one bucket', () => {
    expect(regionBucket('Київ', 'office')).toBe('kyiv');
    expect(regionBucket('Киев', 'hybrid')).toBe('kyiv');
    expect(regionBucket('Lviv, Ukraine', 'office')).toBe('lviv');
  });
  it('falls back to normalized text or unknown', () => {
    expect(regionBucket('Berlin', 'office')).toBe('berlin');
    expect(regionBucket(null, 'unknown')).toBe('unknown');
  });
});

describe('fingerprint', () => {
  it('is stable across cosmetic differences', async () => {
    const a = await fingerprint({ company: 'Acme, Inc.', title: 'Senior React Developer', region: 'remote' });
    const b = await fingerprint({ company: 'ACME', title: 'senior react developer!', region: 'remote' });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('differs for different titles', async () => {
    const a = await fingerprint({ company: 'Acme', title: 'React Developer', region: 'remote' });
    const b = await fingerprint({ company: 'Acme', title: 'Vue Developer', region: 'remote' });
    expect(a).not.toBe(b);
  });
});

describe('language-name canonicalization', () => {
  it('keeps C++, C#, F#, C and .NET apart', () => {
    expect(normalizeTitle('Senior C++ Developer')).toBe('senior cplusplus developer');
    expect(normalizeTitle('Senior C# Developer')).toBe('senior csharp developer');
    expect(normalizeTitle('F# engineer')).toBe('fsharp engineer');
    expect(normalizeTitle('.NET / ASP.NET Developer')).toBe('dotnet asp dotnet developer');
    expect(normalizeTitle('Senior C Developer')).toBe('senior c developer');
  });
  it('gives C++, C# and C titles distinct fingerprints', async () => {
    const fp = (title: string) => fingerprint({ company: 'Acme', title, region: 'remote' });
    const all = await Promise.all(['Senior C++ Developer', 'Senior C# Developer', 'Senior C Developer'].map(fp));
    expect(new Set(all).size).toBe(3);
  });
});
