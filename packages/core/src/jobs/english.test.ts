import { describe, expect, it } from 'vitest';
import { candidateEnglish, englishGap, englishLevelOf, requiredEnglish } from './english';

describe('english level', () => {
  it('reads codes and words', () => {
    expect(englishLevelOf('C1 - Advanced')).toBe('C1');
    expect(englishLevelOf('B2+')).toBe('B2');
    expect(englishLevelOf('Upper-Intermediate')).toBe('B2');
    expect(englishLevelOf('Pre-Intermediate')).toBe('A2');
    expect(englishLevelOf('Intermediate')).toBe('B1');
    expect(englishLevelOf('nothing')).toBeNull();
  });

  it('takes the level a job asks for from a board tag or an English phrase', () => {
    expect(requiredEnglish('Any text', ['english:C1'])).toBe('C1');
    expect(requiredEnglish('Upper-Intermediate (B2) English level, with confident spoken communication.')).toBe('B2');
    expect(requiredEnglish('Англійська мова на рівні B1 і вище')).toBe('B1');
    expect(requiredEnglish('Fluent English is a must')).toBe('C1');
    // A level word that is not about English does not count.
    expect(requiredEnglish('Advanced knowledge of Git. We speak English and Arabic.')).toBeNull();
  });

  it('compares with the CV', () => {
    const me = candidateEnglish([{ language: 'Ukrainian', level: 'Native' }, { language: 'English', level: 'B2 (Upper-Intermediate)' }]);
    expect(me).toBe('B2');
    expect(englishGap('C1', me)).toBe(true);
    expect(englishGap('B2', me)).toBe(false);
    expect(englishGap(null, me)).toBe(false);
  });
});
