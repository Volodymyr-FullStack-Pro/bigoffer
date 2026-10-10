import { readFileSync } from 'node:fs';
import { normalizeJob, SOURCE_IDS } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { SourceBlockedError, type AdapterContext } from '../src/types';
import { ADAPTERS } from '../src/adapters';
import { hnAdapter, parseHnFirstLine } from '../src/adapters/hn';
import { himalayasAdapter } from '../src/adapters/himalayas';
import { joobleAdapter } from '../src/adapters/jooble';
import { remoteokAdapter } from '../src/adapters/remoteok';
import { remotiveAdapter } from '../src/adapters/remotive';
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

describe('joobleAdapter', () => {
  it('is configured only with an API key', () => {
    expect(joobleAdapter.isConfigured!({})).toBe(false);
    expect(joobleAdapter.isConfigured!({ JOOBLE_API_KEY: 'k' })).toBe(true);
  });
  it('POSTs keywords and maps jobs, defaulting a missing company', async () => {
    const { ctx, calls } = fakeContext({ 'jooble.org/api/k': fixture('jooble.json') }, { JOOBLE_API_KEY: 'k' });
    const jobs = await joobleAdapter.search({ keywords: 'react' }, ctx);
    expect(calls[0]!.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ keywords: 'react', location: '', page: '1' });
    expect(jobs).toHaveLength(2);
    expect(jobs[1]!.company).toBe('example.org');
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('parseHnFirstLine', () => {
  it('splits pipe and dash separated headers', () => {
    expect(parseHnFirstLine('Acme | Senior Backend Engineer | Remote (US) | $150k')).toEqual({
      company: 'Acme',
      title: 'Senior Backend Engineer',
      location: 'Remote (US)',
    });
    expect(parseHnFirstLine('PrairieLearn (Remote US) — Full-Stack Software Engineer — TypeScript')).toEqual({
      company: 'PrairieLearn (Remote US)',
      title: 'Full-Stack Software Engineer',
      location: null,
    });
  });
});

describe('hnAdapter', () => {
  it('finds the latest hiring thread and maps top-level comments', async () => {
    const { ctx, calls } = fakeContext({
      'search_by_date': fixture('hn-search.json'),
      'api/v1/items/': fixture('hn-item.json'),
    });
    const jobs = await hnAdapter.search({}, ctx);
    expect(calls).toHaveLength(2);
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('ADAPTERS', () => {
  it('has an adapter for every source id', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...SOURCE_IDS].sort());
  });
});

describe('joobleAdapter key redaction', () => {
  const key = 'sekret-key';
  const failing = (err: Error): AdapterContext => ({
    env: { JOOBLE_API_KEY: key },
    fetchText: async () => {
      throw err;
    },
    fetchJson: async () => {
      throw err;
    },
  });
  const url = `https://jooble.org/api/${key}`;

  it('redacts the key from blocked errors and keeps the type', async () => {
    const err = await joobleAdapter.search({}, failing(new SourceBlockedError(429, url))).catch((e) => e);
    expect(err).toBeInstanceOf(SourceBlockedError);
    expect(err.status).toBe(429);
    expect(err.message).not.toContain(key);
    expect(err.message).toContain('***');
  });
  it.each([500, 404])('redacts the key from HTTP %i errors', async (status) => {
    const err = await joobleAdapter.search({}, failing(new Error(`HTTP ${status} for ${url}`))).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(SourceBlockedError);
    expect(err.message).not.toContain(key);
    expect(err.message).toContain('***');
  });
});

describe('malformed responses', () => {
  it('return no jobs', async () => {
    const { ctx } = fakeContext({ '': {} }, { JOOBLE_API_KEY: 'k' });
    expect(await joobleAdapter.search({}, ctx)).toEqual([]);
    expect(await robotauaAdapter.search({}, ctx)).toEqual([]);
    expect(await hnAdapter.search({}, ctx)).toEqual([]);
    expect(await remotiveAdapter.search({}, ctx)).toEqual([]);
    expect(await himalayasAdapter.search({}, ctx)).toEqual([]);
    expect(await remoteokAdapter.search({}, fakeContext({ '': {} }).ctx)).toEqual([]);
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
