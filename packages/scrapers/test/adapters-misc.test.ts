import { readFileSync } from 'node:fs';
import { normalizeJob, SOURCE_IDS } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { SourceBlockedError, type AdapterContext } from '../src/types';
import { ADAPTERS } from '../src/adapters';
import { robotauaAdapter } from '../src/adapters/robotaua';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('robotauaAdapter', () => {
  it('maps documents to robota.ua vacancy URLs', async () => {
    const { ctx, calls } = fakeContext({
      'api.rabota.ua/vacancy/search': fixture('robotaua.json'),
      'api.rabota.ua/vacancy?id=': { description: '<p>We use <b>React</b>, TypeScript and Node.js every day.</p>' },
    });
    const jobs = await robotauaAdapter.search({ keyWords: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://api.rabota.ua/vacancy/search?keyWords=react&count=40&page=0');
    expect(jobs).toHaveLength(3);
    // The full description replaces the search teaser (one detail call per vacancy).
    expect(calls.filter((c) => c.url.includes('/vacancy?id=')).length).toBe(3);
    expect(jobs[0]!.description).toContain('TypeScript and Node.js');
    expect(jobs[0]!.url).toMatch(/^https:\/\/robota\.ua\/company\d+\/vacancy\d+$/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('robotauaAdapter detail fallback', () => {
  it('keeps the teaser when a detail fetch fails', async () => {
    const { ctx } = fakeContext({ 'api.rabota.ua/vacancy/search': fixture('robotaua.json') });
    const jobs = await robotauaAdapter.search({ keyWords: 'react' }, ctx);
    expect(jobs).toHaveLength(3);
  });
});

describe('ADAPTERS', () => {
  it('has an adapter for every source id', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...SOURCE_IDS].sort());
  });
});

describe('malformed responses', () => {
  it('return no jobs', async () => {
    const { ctx } = fakeContext({ '': {} });
    expect(await robotauaAdapter.search({}, ctx)).toEqual([]);
  });
});

describe('isOpen (closed-posting checks)', () => {
  const gone = { fetchText: async () => { throw new Error('HTTP 404 for x'); }, fetchJson: async () => { throw new Error('HTTP 404 for x'); }, env: {} };
  const blocked = { fetchText: async () => { throw new Error('Blocked'); }, fetchJson: async () => { throw new Error('Blocked'); }, env: {} };
  it('Djinni: the inactive banner means closed; a 404 too; other errors are unknown', async () => {
    const { djinniAdapter } = await import('../src/adapters/djinni');
    const page = (html: string) => ({ fetchText: async () => html, fetchJson: async () => ({}) as never, env: {} });
    expect(await djinniAdapter.isOpen!('u', page('<div class="alert">Ця вакансія зараз неактивна.</div>'))).toBe(false);
    expect(await djinniAdapter.isOpen!('u', page('<button>Відгукнутися</button>'))).toBe(true);
    expect(await djinniAdapter.isOpen!('u', gone)).toBe(false);
    expect(await djinniAdapter.isOpen!('u', blocked)).toBeNull();
  });
  it('DOU: a 404 means removed', async () => {
    const { douAdapter } = await import('../src/adapters/dou');
    expect(await douAdapter.isOpen!('u', { fetchText: async () => '<html/>', fetchJson: async () => ({}) as never, env: {} })).toBe(true);
    expect(await douAdapter.isOpen!('u', gone)).toBe(false);
  });
  it('robota.ua: isActive from the vacancy API', async () => {
    const url = 'https://robota.ua/company1/vacancy123';
    expect(await robotauaAdapter.isOpen!(url, { fetchText: async () => '', fetchJson: async () => ({ isActive: false }) as never, env: {} })).toBe(false);
    expect(await robotauaAdapter.isOpen!(url, { fetchText: async () => '', fetchJson: async () => ({ isActive: true }) as never, env: {} })).toBe(true);
  });
});
