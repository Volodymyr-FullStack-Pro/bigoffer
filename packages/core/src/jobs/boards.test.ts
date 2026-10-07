import { describe, expect, it } from 'vitest';
import { boardQuerySpecs, isTechTitle } from './boards';

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

describe('boardQuerySpecs', () => {
  it('builds one query per board of an enabled source', () => {
    const specs = boardQuerySpecs(
      [
        { sourceId: 'greenhouse', slug: 'gitlab' },
        { sourceId: 'ashby', slug: 'supabase' },
        { sourceId: 'telegram', slug: 'job_it_junior' },
      ],
      ['greenhouse', 'telegram', 'dou'],
    );
    expect(specs.map((s) => [s.sourceId, s.params])).toEqual([
      ['greenhouse', { board: 'gitlab' }],
      ['telegram', { board: 'job_it_junior' }],
    ]);
    expect(specs[0]!.queryKey).toBe('greenhouse:{"board":"gitlab"}');
  });

  it('carries the company display name in params when the board has one', () => {
    const [named, plain] = boardQuerySpecs(
      [
        { sourceId: 'lever', slug: 'ajax', name: 'Ajax Systems' },
        { sourceId: 'lever', slug: 'eleks' },
      ],
      ['lever'],
    );
    expect(named!.params).toEqual({ board: 'ajax', name: 'Ajax Systems' });
    expect(named!.queryKey).toContain('Ajax Systems');
    expect(plain!.params).toEqual({ board: 'eleks' });
  });
});
