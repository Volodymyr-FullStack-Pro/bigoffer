import { describe, expect, it } from 'vitest';
import { cardSkills, matchedSkillsOf, skillKey } from './card-skills';

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

describe('skill matching for the job tech block', () => {
  it('treats spelling variants as the same technology', () => {
    expect(skillKey('Node.js')).toBe(skillKey('NodeJS'));
    expect(skillKey('Tailwind CSS')).toBe(skillKey('Tailwind'));
    expect(skillKey('ReactJS')).toBe(skillKey('React'));
    expect(skillKey('REST APIs')).toBe(skillKey('REST'));
    expect(skillKey('C#')).not.toBe(skillKey('C++'));
  });
  it('marks job skills the user lists as theirs, even when the text did not match them', () => {
    expect(cardSkills(['AWS', 'Docker', 'Tailwind CSS', 'React'], ['React'], 20, ['Tailwind', 'AWS'])).toEqual([
      { name: 'AWS', matched: true },
      { name: 'Tailwind CSS', matched: true },
      { name: 'React', matched: true },
      { name: 'Docker', matched: false },
    ]);
  });
});
