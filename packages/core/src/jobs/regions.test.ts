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
