import { describe, expect, it } from 'vitest';
import { cardSkills, matchedSkillsOf } from './card-skills';

describe('cardSkills', () => {
  it('puts matched skills first and caps the list', () => {
    expect(cardSkills(['Docker', 'React', 'Kafka', 'Go', 'AWS', 'SQL'], ['kafka', 'react'])).toEqual([
      { name: 'React', matched: true },
      { name: 'Kafka', matched: true },
      { name: 'Docker', matched: false },
      { name: 'Go', matched: false },
      { name: 'AWS', matched: false },
    ]);
  });
  it('falls back to matched skills when the job has no AI skills', () => {
    expect(cardSkills([], ['React'])).toEqual([{ name: 'React', matched: true }]);
  });
  it('reads matched skills from a stored breakdown defensively', () => {
    expect(matchedSkillsOf({ matchedSkills: ['React', 3] })).toEqual(['React']);
    expect(matchedSkillsOf({ matchedSkills: 'React' })).toEqual([]);
    expect(matchedSkillsOf(null)).toEqual([]);
  });
});
