import { readFileSync } from 'node:fs';
import { normalizeJob, SOURCE_IDS } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../src/adapters';
import { hnAdapter, parseHnFirstLine } from '../src/adapters/hn';
import { joobleAdapter } from '../src/adapters/jooble';
import { robotauaAdapter } from '../src/adapters/robotaua';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('robotauaAdapter', () => {
  it('maps documents to robota.ua vacancy URLs', async () => {
    const { ctx, calls } = fakeContext({ 'api.rabota.ua': fixture('robotaua.json') });
    const jobs = await robotauaAdapter.search({ keyWords: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://api.rabota.ua/vacancy/search?keyWords=react&count=40&page=0');
    expect(jobs).toHaveLength(3);
    expect(jobs[0]!.url).toMatch(/^https:\/\/robota\.ua\/company\d+\/vacancy\d+$/);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
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
