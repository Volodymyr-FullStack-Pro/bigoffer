import { describe, expect, it } from 'vitest';
import { emptyToUndefined, isValidTimeZone, profileUpdateSchema } from './profile-schema';

describe('emptyToUndefined', () => {
  it('converts blank strings to undefined and keeps others', () => {
    expect(emptyToUndefined({ a: '', b: '  ', c: 'x', d: 5 })).toEqual({
      a: undefined,
      b: undefined,
      c: 'x',
      d: 5,
    });
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones', () => {
    expect(isValidTimeZone('Europe/Kyiv')).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
  });
});

describe('profileUpdateSchema', () => {
  const valid = {
    full_name: '  Volodymyr Babiichuk ',
    timezone: 'Europe/Kyiv',
    contacts: {
      email: 'me@example.com',
      phone: '+38 (068) 025 3147',
      linkedin: 'https://linkedin.com/in/someone',
      github: 'https://github.com/someone',
      telegram: '@someone',
    },
  };

  it('parses a valid profile and trims the name', () => {
    const result = profileUpdateSchema.parse(valid);
    expect(result.full_name).toBe('Volodymyr Babiichuk');
    expect(result.contacts.portfolio).toBeUndefined();
  });

  it('rejects an empty name', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, full_name: '  ' }).success).toBe(false);
  });

  it('rejects an invalid timezone', () => {
    expect(profileUpdateSchema.safeParse({ ...valid, timezone: 'Nowhere' }).success).toBe(false);
  });

  it('rejects non-http links', () => {
    const bad = { ...valid, contacts: { ...valid.contacts, github: 'javascript:alert(1)' } };
    const result = profileUpdateSchema.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['contacts', 'github']);
  });

  it('rejects an invalid email', () => {
    const bad = { ...valid, contacts: { ...valid.contacts, email: 'nope' } };
    expect(profileUpdateSchema.safeParse(bad).success).toBe(false);
  });
});
