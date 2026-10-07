import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, COUNTRY_REGIONS, isCountryCode, normalizeRemoteRegions, REMOTE_REGIONS, remoteBlockedFor } from './regions';

describe('regions', () => {
  it('maps every country only to known regions', () => {
    for (const regions of Object.values(COUNTRY_REGIONS)) {
      for (const r of regions) expect(REMOTE_REGIONS).toContain(r);
    }
    expect(COUNTRY_CODES).toContain('UA');
    expect(isCountryCode('UA')).toBe(true);
    expect(isCountryCode('ua')).toBe(false);
    expect(isCountryCode('XX')).toBe(false);
  });

  it('normalizes AI region output', () => {
    expect(normalizeRemoteRegions([' Europe ', 'north america', 'US', 'pl', 'UK', 'Mars', 'europe', ''])).toEqual([
      'europe', 'north_america', 'us', 'PL', 'uk',
    ]);
  });

  it('blocks only when the job names regions that exclude the candidate country', () => {
    expect(remoteBlockedFor(['us'], 'UA')).toBe(true);
    expect(remoteBlockedFor(['north_america', 'latam'], 'PL')).toBe(true);
    expect(remoteBlockedFor(['europe'], 'UA')).toBe(false);
    expect(remoteBlockedFor(['eu'], 'UA')).toBe(true);
    expect(remoteBlockedFor(['eu'], 'PL')).toBe(false);
    expect(remoteBlockedFor(['UA', 'us'], 'UA')).toBe(false);
    expect(remoteBlockedFor(['worldwide', 'us'], 'UA')).toBe(false);
    expect(remoteBlockedFor([], 'UA')).toBe(false);
    expect(remoteBlockedFor(['us'], null)).toBe(false);
    expect(remoteBlockedFor(['us'], 'ZZ')).toBe(false);
  });
});

describe('regionsFromLocation', () => {
  it('maps board location fields to regions and ISO countries', async () => {
    const { regionsFromLocation, countryCodeFromName } = await import('./regions');
    expect(countryCodeFromName('United States')).toBe('US');
    expect(countryCodeFromName('Ukraine')).toBe('UA');
    expect(countryCodeFromName('Czechia')).toBe('CZ');
    expect(countryCodeFromName('Narnia')).toBeNull();
    expect(regionsFromLocation('USA')).toEqual(['US']);
    expect(regionsFromLocation('Canada,  USA')).toEqual(['CA', 'US']);
    expect(regionsFromLocation('Anywhere in India')).toEqual(['IN']);
    expect(regionsFromLocation('Europe, USA, UK')).toEqual(['europe', 'US', 'uk']);
    expect(regionsFromLocation(['United States'])).toEqual(['US']);
    expect(regionsFromLocation(['Poland', 'Ukraine', 'Germany'])).toEqual(['PL', 'UA', 'DE']);
  });
  it('returns no restriction when unsure or unrestricted', async () => {
    const { regionsFromLocation } = await import('./regions');
    expect(regionsFromLocation('Global')).toEqual(['worldwide']);
    expect(regionsFromLocation('Anywhere in the World')).toEqual(['worldwide']);
    expect(regionsFromLocation('Worldwide, USA')).toEqual(['worldwide']);
    expect(regionsFromLocation('Remote')).toEqual([]);
    expect(regionsFromLocation('Toronto office or nearby')).toEqual([]);
    expect(regionsFromLocation('')).toEqual([]);
    expect(regionsFromLocation([])).toEqual([]);
  });
});
