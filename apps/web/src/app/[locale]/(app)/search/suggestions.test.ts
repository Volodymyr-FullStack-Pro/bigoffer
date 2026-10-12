import { describe, expect, it } from 'vitest';
import { skillSuggestions } from './suggestions';

describe('skillSuggestions', () => {
  it('puts CV skills first and counts spelling variants once', () => {
    const s = skillSuggestions(['frontend'], ['Tailwind', 'React.js']);
    expect(s.slice(0, 2)).toEqual(['Tailwind', 'React.js']);
    expect(s).not.toContain('Tailwind CSS');
    expect(s).not.toContain('React');
    expect(s).toContain('TypeScript');
  });
  it('interleaves several roles by rank', () => {
    const s = skillSuggestions(['qa', 'devops'], []);
    expect(s.slice(0, 4)).toEqual(['Manual Testing', 'Docker', 'Test Automation', 'Kubernetes']);
  });
  it('has a solid list for every role', () => {
    for (const role of ['frontend', 'fullstack', 'backend', 'mobile', 'devops', 'qa', 'data', 'design', 'management', 'support'] as const) {
      expect(skillSuggestions([role], []).length, role).toBeGreaterThanOrEqual(18);
    }
  });
});
