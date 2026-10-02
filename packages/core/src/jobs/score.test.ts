import { describe, expect, it } from 'vitest';
import type { SearchProfile } from './search';
import { scoreJob, type ScorableJob } from './score';

const profile: SearchProfile = {
  id: 'p1',
  userId: 'u1',
  keywords: ['full stack', 'react developer'],
  skills: ['React', 'Node.js', 'PostgreSQL', 'Go'],
  excludeKeywords: ['1C', 'gambling'],
  seniority: ['middle', 'senior'],
  locations: [],
  remoteType: 'remote',
  salaryMinUsd: 3000,
};

const job: ScorableJob = {
  title: 'Senior Full Stack Engineer',
  descriptionText: 'We use React, Node.js and PostgreSQL. Good benefits.',
  tags: [],
  remoteType: 'remote',
  seniority: 'senior',
  location: null,
  salaryMinUsd: 3500,
  salaryMaxUsd: 5000,
};

describe('scoreJob', () => {
  it('scores a strong match', () => {
    const r = scoreJob(profile, job)!;
    expect(r.hidden).toBe(false);
    expect(r.breakdown.role).toBe(25);
    expect(r.breakdown.matchedSkills).toEqual(['React', 'Node.js', 'PostgreSQL']);
    expect(r.breakdown.skills).toBe(26);
    expect(r.breakdown.seniority).toBe(15);
    expect(r.breakdown.location).toBe(15);
    expect(r.breakdown.salary).toBe(10);
    expect(r.score).toBe(91);
  });

  it('does not match short skills inside other words', () => {
    const r = scoreJob(profile, job)!;
    expect(r.breakdown.matchedSkills).not.toContain('Go');
  });

  it('returns null when nothing relevant is found', () => {
    expect(scoreJob(profile, { ...job, title: 'Accountant', descriptionText: 'Excel and taxes' })).toBeNull();
  });

  it('hides jobs with exclude keywords', () => {
    const r = scoreJob(profile, { ...job, descriptionText: `${job.descriptionText} Gambling product.` })!;
    expect(r.hidden).toBe(true);
    expect(r.breakdown.excludedBy).toBe('gambling');
  });

  it('gives partial points for unknown values', () => {
    const r = scoreJob(profile, { ...job, seniority: null, remoteType: 'unknown', salaryMinUsd: null, salaryMaxUsd: null })!;
    expect(r.breakdown.seniority).toBe(8);
    expect(r.breakdown.location).toBe(8);
    expect(r.breakdown.salary).toBe(5);
  });

  it('penalizes office jobs for remote-only profiles and low salary', () => {
    const r = scoreJob(profile, { ...job, remoteType: 'office', salaryMinUsd: 1000, salaryMaxUsd: 1500 })!;
    expect(r.breakdown.location).toBe(0);
    expect(r.breakdown.salary).toBe(0);
  });

  it('gives half role points when keyword only in description', () => {
    const r = scoreJob(profile, { ...job, title: 'Software Engineer', descriptionText: 'Full stack role with React' })!;
    expect(r.breakdown.role).toBe(12);
  });
});
