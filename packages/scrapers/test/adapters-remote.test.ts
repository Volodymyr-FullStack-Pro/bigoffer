import { readFileSync } from 'node:fs';
import { normalizeJob } from '@jp/core';
import { describe, expect, it } from 'vitest';
import { himalayasAdapter } from '../src/adapters/himalayas';
import { remoteokAdapter } from '../src/adapters/remoteok';
import { remotiveAdapter } from '../src/adapters/remotive';
import { fakeContext } from './fake-context';

const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

describe('remoteokAdapter', () => {
  it('skips the legal notice and maps jobs', async () => {
    const { ctx, calls } = fakeContext({ 'remoteok.com/api': fixture('remoteok.json') });
    const jobs = await remoteokAdapter.search({ tag: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://remoteok.com/api?tag=react');
    expect(jobs).toHaveLength(3);
    expect(jobs.every((j) => j.remoteHint === 'remote')).toBe(true);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('remotiveAdapter', () => {
  it('maps jobs from the search API', async () => {
    const { ctx, calls } = fakeContext({ 'remotive.com/api': fixture('remotive.json') });
    const jobs = await remotiveAdapter.search({ search: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://remotive.com/api/remote-jobs?search=react&limit=50');
    expect(jobs).toHaveLength(3);
    for (const raw of jobs) expect(await normalizeJob(raw)).not.toBeNull();
  });
});

describe('himalayasAdapter', () => {
  it('maps jobs with annual salary and epoch dates', async () => {
    const { ctx, calls } = fakeContext({ 'himalayas.app/jobs/api/search': fixture('himalayas.json') });
    const jobs = await himalayasAdapter.search({ q: 'react' }, ctx);
    expect(calls[0]!.url).toBe('https://himalayas.app/jobs/api/search?q=react&limit=50');
    expect(jobs).toHaveLength(3);
    const normalized = await Promise.all(jobs.map(normalizeJob));
    expect(normalized.every(Boolean)).toBe(true);
    expect(normalized[0]!.postedAt?.getUTCFullYear()).toBeGreaterThanOrEqual(2026);
  });
});

describe('board-stated hiring regions', () => {
  it('carries remotive and himalayas location restrictions as regions', async () => {
    const { remotiveAdapter } = await import('../src/adapters/remotive');
    const { himalayasAdapter } = await import('../src/adapters/himalayas');
    const { fakeContext } = await import('./fake-context');
    const { readFileSync } = await import('node:fs');
    const fx = (n: string) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
    const remotive = await remotiveAdapter.search({ search: 'react' }, fakeContext({ 'remotive.com': fx('remotive.json') }).ctx);
    expect(remotive[1]!.remoteRegions).toEqual(['US']);
    expect(remotive[2]!.remoteRegions).toEqual(['US', 'CA', 'AR', 'MX', 'PE']);
    const himalayas = await himalayasAdapter.search({ q: 'react' }, fakeContext({ 'himalayas.app': fx('himalayas.json') }).ctx);
    expect(himalayas[0]!.remoteRegions).toContain('UA');
  });
});
