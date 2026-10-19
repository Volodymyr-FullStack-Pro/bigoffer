import { describe, expect, it } from 'vitest';
import type { SearchProfile } from './search';
import { isTechTitle, missingCoreStacks, namedPlatforms, scoreJob, type ScorableJob, wantedByAnyProfile } from './score';

describe('isTechTitle', () => {
  it('keeps engineering roles and drops the rest', () => {
    for (const t of ['Senior Frontend Engineer', 'Full-Stack Developer (React/Node)', 'Software Engineer, Payments', 'Staff Web Developer', 'React Native Engineer', 'Node.js Backend Engineer', 'TypeScript Developer', 'Front-end розробник', 'Fullstack разработчик']) {
      expect(isTechTitle(t), t).toBe(true);
    }
    for (const t of ['Account Executive - France', 'Recruiter', 'Product Marketing Manager', 'Customer Success Manager', 'Legal Counsel']) {
      expect(isTechTitle(t), t).toBe(false);
    }
  });
});

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

  it('keeps a generic title the AI calls backend, with fewer role points', () => {
    const r = scoreJob(owner, { ...backend, title: 'Software Engineer II', role: 'Backend Developer' })!;
    expect(r.hidden).toBe(false);
    expect(r.breakdown.excludedBy).toBeNull();
    expect(r.breakdown.role).toBeLessThan(25);
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

describe('skill credit saturation', () => {
  const many: SearchProfile = { ...profile, skills: Array.from({ length: 30 }, (_, i) => `Skill${i}`).concat(['React', 'Node.js', 'PostgreSQL', 'TypeScript', 'Docker', 'AWS']) };
  it('a long profile list does not dilute a job that matches six of its skills', () => {
    const r = scoreJob(many, { ...job, descriptionText: 'React, Node.js, PostgreSQL, TypeScript, Docker and AWS.' })!;
    expect(r.breakdown.skills).toBe(35);
  });
  it('fewer matches earn a share of the saturation point', () => {
    const r = scoreJob(many, { ...job, descriptionText: 'React and Node.js, PostgreSQL.' })!;
    expect(r.breakdown.skills).toBe(Math.round((35 * 3) / 6));
  });
});

describe('seniority filter', () => {
  const jm: SearchProfile = { ...profile, seniority: ['junior', 'middle'] };
  it('hides a job whose stated level is not chosen', () => {
    expect(scoreJob(jm, { ...job, seniority: 'senior' })!.breakdown.excludedBy).toBe('seniority');
  });
  it('keeps chosen levels and jobs without a level', () => {
    expect(scoreJob(jm, { ...job, title: 'Middle Full Stack Engineer', seniority: 'middle' })!.hidden).toBe(false);
    expect(scoreJob(jm, { ...job, title: 'Full Stack Engineer', seniority: null })!.hidden).toBe(false);
  });
  it('does not hide on a level only the AI inferred (title states none)', () => {
    const r = scoreJob(jm, {
      ...job,
      title: 'Full-Stack Developer (Next.js, TypeScript, Supabase) who builds with AI coding agents',
      descriptionText: 'You have 3+ years of real web development with React or Next.js.',
      seniority: 'senior',
    })!;
    expect(r.hidden).toBe(false);
    expect(r.breakdown.excludedBy).toBeNull();
    expect(r.breakdown.seniority).toBe(8); // adjacent to middle: scored lower, still shown
  });
});

describe('remote-only filter', () => {
  it('hides hybrid and office jobs, keeps remote and unknown', () => {
    const remote: SearchProfile = { ...profile, remoteType: 'remote' };
    expect(scoreJob(remote, { ...job, remoteType: 'hybrid' })!.breakdown.excludedBy).toBe('format');
    expect(scoreJob(remote, { ...job, remoteType: 'office' })!.breakdown.excludedBy).toBe('format');
    expect(scoreJob(remote, { ...job, remoteType: 'unknown' })!.hidden).toBe(false);
    expect(scoreJob({ ...profile, remoteType: 'any' }, { ...job, remoteType: 'office' })!.hidden).toBe(false);
  });
});

describe('non-technical titles in a tech search', () => {
  const fe: SearchProfile = { ...profile, keywords: ['frontend', 'react'], skills: ['React', 'Figma', 'Google Sheets'], targetRoles: ['frontend', 'fullstack'] };
  it('hides a non-technical job even when generic skills and a keyword match', () => {
    const r = scoreJob(fe, { ...job, title: 'Jr Creative Strategist', descriptionText: 'React quickly to trends. Figma, Google Sheets.' });
    expect(r?.breakdown.excludedBy ?? 'role').toBe('role');
  });
  it('keeps a generic technical title', () => {
    expect(scoreJob(fe, { ...job, title: 'Software Engineer', descriptionText: 'React and TypeScript' })!.hidden).toBe(false);
  });
});


describe('keyword spellings', () => {
  const fe: SearchProfile = { ...profile, keywords: ['frontend'], skills: [], targetRoles: ['frontend'], seniority: [] };
  const plain = { ...job, descriptionText: 'Команда продукту.', tags: [] };
  it('matches the same role word however the title spells it', () => {
    for (const title of ['Front-End Developer', 'Front end engineer', 'Фронтенд розробник', 'Верстальник (HTML/CSS)']) {
      expect(scoreJob(fe, { ...plain, title }), title).not.toBeNull();
    }
  });
});

describe('main stack the candidate lacks', () => {
  const js: SearchProfile = { ...profile, skills: ['TypeScript', 'JavaScript', 'React', 'Node.js', 'PostgreSQL', 'Docker', 'AWS', 'Git'] };
  it('caps skill points for a .NET or Java full-stack job, however many tools overlap', () => {
    const dotnet = scoreJob(js, { ...job, title: 'Senior FullStack .NET Engineer', skills: ['.NET', 'C#', 'React', 'Docker', 'Git', 'AWS', 'PostgreSQL'] })!;
    expect(dotnet.breakdown.skills).toBe(8);
    expect(dotnet.breakdown.missingStack).toEqual(['.NET']);
    const java = scoreJob(js, { ...job, title: 'Senior Full Stack Engineer (Java / Vue)', skills: ['Java', 'Spring', 'TypeScript', 'Docker', 'Git', 'AWS'] })!;
    expect(java.breakdown.missingStack).toEqual(['Java']);
    expect(java.score).toBeLessThan(scoreJob(js, { ...job, skills: ['React', 'Node.js', 'TypeScript', 'Docker', 'Git', 'AWS'] })!.score);
  });
  it('keeps full points when the candidate has one of the stacks, and for JavaScript', () => {
    const py = scoreJob({ ...js, skills: [...js.skills, 'Python'] }, { ...job, title: 'Full Stack Engineer (React + Python)', skills: ['Python', 'React'] })!;
    expect(py.breakdown.missingStack).toBeUndefined();
    const node = scoreJob(js, { ...job, title: 'Full Stack JavaScript Developer', skills: ['JavaScript', 'Node.js', 'React'] })!;
    expect(node.breakdown.missingStack).toBeUndefined();
  });
});

describe('namedPlatforms', () => {
  it('finds the platforms a posting names that the skills lack', () => {
    const text = 'Our site is built on WordPress. Build the catalog using WooCommerce, custom plugins in PHP and JavaScript.';
    expect(namedPlatforms(text, ['JavaScript', 'React', 'HTML'])).toEqual(['WordPress', 'WooCommerce', 'PHP']);
    expect(namedPlatforms(text, ['wordpress', 'WooCommerce', 'PHP'])).toEqual([]);
    expect(namedPlatforms('Strong JavaScript and React', [])).toEqual([]);
  });

  it('counts WordPress work as the PHP stack', () => {
    expect(missingCoreStacks('Web developer', ['WordPress', 'JavaScript'], ['JavaScript', 'React'])).toEqual(['PHP']);
  });
});

describe('generic skills', () => {
  const dev: SearchProfile = {
    ...profile,
    keywords: ['full stack', 'react developer'],
    skills: ['React', 'Node.js', 'TypeScript', 'JavaScript', 'Git', 'CI/CD', 'REST APIs', 'HTML', 'CSS', 'Cursor', 'Claude Code'],
  };
  it('do not make an unrelated job relevant on their own', () => {
    expect(scoreJob(dev, { ...job, title: 'Dephi Developer', descriptionText: 'Delphi 7, Firebird. Git and CI/CD.' })).toBeNull();
    expect(scoreJob(dev, { ...job, title: 'DWH Engineer', descriptionText: 'Python, SQL, Airflow, REST APIs, Git.' })).toBeNull();
    expect(scoreJob(dev, { ...job, title: 'SEO Content Specialist (AI - Automation)', descriptionText: 'SEO texts with Cursor and Claude Code, a bit of JavaScript.' })).toBeNull();
  });
  it('still count with core skills: a Node.js job with a plain title stays', () => {
    const r = scoreJob(dev, { ...job, title: 'Senior Software Engineer', descriptionText: 'Node.js and TypeScript services, Git, CI/CD.' });
    expect(r).not.toBeNull();
    expect(r!.breakdown.matchedSkills).toEqual(expect.arrayContaining(['Node.js', 'TypeScript', 'Git']));
  });
});
