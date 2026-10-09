import { describe, expect, it } from 'vitest';
import { kitCandidate } from './template';

describe('kitCandidate', () => {
  it('keeps the name and non-empty string contacts only', () => {
    expect(kitCandidate({ full_name: ' Jane Doe ', contacts: { phone: '+380 50 000 0000', github: '', linkedin: 42, unknown: 'x' } })).toEqual({
      fullName: 'Jane Doe',
      contacts: { phone: '+380 50 000 0000' },
    });
  });
  it('handles a missing profile', () => {
    expect(kitCandidate(null)).toEqual({ fullName: null, contacts: {} });
    expect(kitCandidate({ full_name: '', contacts: null })).toEqual({ fullName: null, contacts: {} });
  });
});
