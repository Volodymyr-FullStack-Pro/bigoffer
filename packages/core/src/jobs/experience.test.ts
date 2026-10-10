import { describe, expect, it } from 'vitest';
import { requiredYears } from './experience';

describe('requiredYears', () => {
  it.each([
    ['3+ years of commercial experience with React', 3],
    ["5 years' experience in software development", 5],
    ['2-3 years of experience', 2],
    ['Experience: 4+ years', 4],
    ['At least 2 years in frontend development', 2],
    ['Minimum of 3 years building web apps', 3],
    ['Досвід від 3 років', 3],
    ['від 2-х років досвіду з React', 2],
    ['3+ роки комерційного досвіду', 3],
    ['Опыт от 3 лет', 3],
    ['Опыт работы 2+ года с TypeScript', 2],
    ['3+ years of React and 1+ year of Node.js experience', 3],
    ['You have between 2 years and 6 years of experience', 2],
    ['have 4-10+ years experience working with teams', 4],
    ['from 3 to 5 years of experience', 3],
  ])('%s → %s', (text, years) => {
    expect(requiredYears(text)).toBe(years);
  });

  it('ignores numbers that are not an experience requirement', () => {
    expect(requiredYears('We have been on the market for 20 years. Remote team of 50.')).toBeNull();
    expect(requiredYears('Compensation 3000-4000 USD. React, Node.js.')).toBeNull();
  });
});
