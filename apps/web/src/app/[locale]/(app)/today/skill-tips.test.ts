import { describe, expect, it } from 'vitest';
import { missingSkillTip } from './skill-tips';

const job = (...techs: [string, boolean][]) => ({ techs: techs.map(([name, matched]) => ({ name, matched })) });

describe('missingSkillTip', () => {
  it('picks the missing skill most jobs ask for, counting each job once', () => {
    const tip = missingSkillTip(
      [job(['CI/CD', false], ['React', true]), job(['CI/CD', false], ['Docker', false]), job(['ci/cd', false], ['CI/CD', false]), job(['Docker', false])],
      [],
    );
    expect(tip).toEqual({ skill: 'CI/CD', count: 3 });
  });

  it('skips declined skills and stays quiet below the threshold', () => {
    const jobs = [job(['GraphQL', false]), job(['GraphQL', false]), job(['GraphQL', false]), job(['Docker', false])];
    expect(missingSkillTip(jobs, ['graphql'])).toBeNull();
    expect(missingSkillTip(jobs, [], 4)).toBeNull();
  });
});
