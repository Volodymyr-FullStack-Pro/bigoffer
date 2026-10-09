import { describe, expect, it } from 'vitest';
import type { SearchProfile } from './search';
import { scoreJob, type ScorableJob, wantedByAnyProfile } from './score';

const profile: SearchProfile = {
  id: 'p1',
  userId: 'u1',
  keywords: ['full stack', 'react developer'],
  targetRoles: [],
  skills: ['React', 'Node.js', 'PostgreSQL', 'Go'],
  excludeKeywords: ['1C', 'gambling'],
  seniority: ['middle', 'senior'],
  locations: [],
  remoteType: 'remote',
  salaryMinUsd: 3000,
  sources: null,
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

  const mk = (over: Partial<SearchProfile>): SearchProfile => ({ ...profile, ...over });
  const j = (title: string, descriptionText = ''): ScorableJob => ({ ...job, title, descriptionText });

  it('matches compounds and hyphens', () => {
    const p = mk({ keywords: ['full stack'], skills: [] });
    expect(scoreJob(p, j('Full-Stack Developer'))!.breakdown.role).toBe(25);
    expect(scoreJob(p, j('Fullstack Engineer'))!.breakdown.role).toBe(25);
    expect(scoreJob(mk({ keywords: ['front end'], skills: [] }), j('Front-end Developer'))!.breakdown.role).toBe(25);
    expect(scoreJob(mk({ keywords: ['react developer'], skills: [] }), j('React.js Developer'))!.breakdown.role).toBe(25);
  });

  it('handles Cyrillic morphology', () => {
    const p = mk({ keywords: ['розробник'], skills: [] });
    expect(scoreJob(p, j('Junior розробника'))).not.toBeNull();
    expect(scoreJob(p, j('Нові розробники'))).not.toBeNull();
    expect(scoreJob(mk({ keywords: ['разработчик'], skills: [] }), j('Нужен разработчика'))).not.toBeNull();
  });

  it('matches ambiguous skills case-sensitively', () => {
    const p = mk({ keywords: ['zzz'], skills: ['Go'] });
    expect(scoreJob(p, j('Dev', 'ready to go'))).toBeNull();
    expect(scoreJob(p, j('Dev', 'We use Go and Postgres'))).not.toBeNull();
    expect(scoreJob(p, j('Dev', 'Go-to-market lead'))).toBeNull();
  });

  it('requires 2 skills unless profile has a single skill', () => {
    expect(scoreJob(mk({ keywords: ['zzz'] }), j('Dev', 'We use Go and cars'))).toBeNull();
    expect(scoreJob(mk({ keywords: ['zzz'], skills: ['Python'] }), j('Dev', 'python'))).not.toBeNull();
  });

  it('handles + and # boundaries', () => {
    const p = mk({ keywords: ['zzz'], skills: ['React', 'Redux'] });
    expect(scoreJob(p, j('Dev', 'React+Redux'))!.breakdown.matchedSkills).toEqual(['React', 'Redux']);
    expect(scoreJob(mk({ keywords: ['zzz'], skills: ['C'] }), j('Dev', 'C++ developer'))).toBeNull();
    expect(scoreJob(mk({ keywords: ['zzz'], skills: ['C#'] }), j('Dev', 'C# / .NET'))).not.toBeNull();
  });

  it('never matches a posting the AI flagged as not a job', () => {
    expect(scoreJob(profile, { ...job, isJob: false })).toBeNull();
    expect(scoreJob(profile, { ...job, isJob: null })).not.toBeNull();
  });

  it('uses AI skills that the text does not mention', () => {
    const r = scoreJob(profile, { ...job, descriptionText: 'Great team.', skills: ['react', 'go'] })!;
    expect(r.breakdown.matchedSkills).toEqual(['React', 'Go']);
  });

  it('hides a remote job that does not hire from the candidate country', () => {
    const r = scoreJob({ ...profile, candidateCountry: 'UA' }, { ...job, remoteRegions: ['us', 'canada'] })!;
    expect(r.hidden).toBe(true);
    expect(r.breakdown.location).toBe(0);
    expect(r.breakdown.excludedBy).toBe('region');
    expect(r.breakdown.blockedRegions).toEqual(['us', 'canada']);
  });

  it('keeps a remote job open to the candidate region', () => {
    const r = scoreJob({ ...profile, candidateCountry: 'UA' }, { ...job, remoteRegions: ['europe'] })!;
    expect(r.hidden).toBe(false);
    expect(r.breakdown.location).toBe(15);
    expect(r.breakdown.blockedRegions).toBeNull();
  });

  it('prefers a keyword exclusion over a region block', () => {
    const r = scoreJob(
      { ...profile, candidateCountry: 'UA' },
      { ...job, descriptionText: `${job.descriptionText} gambling`, remoteRegions: ['us'] },
    )!;
    expect(r.breakdown.excludedBy).toBe('gambling');
  });
});

describe('scoreJob role families', () => {
  const owner: SearchProfile = { ...profile, keywords: ['full stack', 'react', 'node.js', 'next.js', 'frontend'], skills: ['React', 'TypeScript', 'Node.js', 'NestJS'] };
  const backend: ScorableJob = { ...job, title: 'Senior Backend Developer (Node.js + TypeScript)', descriptionText: 'Node.js, NestJS, TypeScript, PostgreSQL' };

  it('hides a backend job for a frontend/fullstack search (keywords imply the targets)', () => {
    const r = scoreJob(owner, backend)!;
    expect(r.hidden).toBe(true);
    expect(r.breakdown.excludedBy).toBe('role');
  });

  it('hides by the AI role when the title is generic', () => {
    const r = scoreJob(owner, { ...backend, title: 'Software Engineer II', role: 'Backend Developer' })!;
    expect(r.breakdown.excludedBy).toBe('role');
  });

  it('keeps a generic title but gives less role credit than a matching family', () => {
    const generic = scoreJob(owner, { ...backend, title: 'Software Engineer (Node.js/React)' })!;
    const full = scoreJob(owner, { ...backend, title: 'Full Stack Engineer (Node.js/React)' })!;
    expect(generic.hidden).toBe(false);
    expect(generic.breakdown.role).toBe(18);
    expect(full.breakdown.role).toBe(25);
  });

  it('explicit target roles override the keywords', () => {
    const r = scoreJob({ ...owner, targetRoles: ['backend'] }, backend)!;
    expect(r.hidden).toBe(false);
    expect(r.breakdown.role).toBe(25);
  });
});

describe('wantedByAnyProfile', () => {
  it('keeps a job one profile shows and drops one every profile hides or ignores', () => {
    const fe: SearchProfile = { ...profile, keywords: ['frontend'], targetRoles: [] };
    expect(wantedByAnyProfile([fe], { ...job, title: 'Frontend Engineer', descriptionText: 'React' })).toBe(true);
    expect(wantedByAnyProfile([fe], { ...job, title: 'Backend Engineer', descriptionText: 'React, Node.js' })).toBe(false);
    expect(wantedByAnyProfile([fe], { ...job, title: 'Account Executive', descriptionText: 'Sales' })).toBe(false);
    expect(wantedByAnyProfile([], job)).toBe(false);
  });
});

