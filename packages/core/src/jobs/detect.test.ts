import { describe, expect, it } from 'vitest';
import { detectRemote, detectSeniority, parseSalary } from './detect';

describe('detectRemote', () => {
  it.each([
    ['Fully remote, work from anywhere', 'remote'],
    ['Київ, віддалено', 'remote'],
    ['Удаленная работа', 'remote'],
    ['Hybrid: 2 days in office', 'hybrid'],
    ['Офіс у Львові', 'office'],
    ['On-site in Berlin', 'office'],
    ['Great team', 'unknown'],
  ] as const)('%s → %s', (text, expected) => {
    expect(detectRemote(text)).toBe(expected);
  });
});

describe('detectSeniority', () => {
  it.each([
    ['Senior React Developer', 'senior'],
    ['Sr. Backend Engineer', 'senior'],
    ['Team Lead / Senior Node.js', 'lead'],
    ['Junior/Middle Frontend', 'middle'],
    ['Junior QA', 'junior'],
    ['Стажер-розробник', 'intern'],
    ['Мідл Python розробник', 'middle'],
    ['Full Stack Developer', null],
  ] as const)('%s → %s', (title, expected) => {
    expect(detectSeniority(title)).toBe(expected);
  });
});

describe('parseSalary', () => {
  it('parses a USD range', () => {
    expect(parseSalary('$3000–4500')).toEqual({ minUsd: 3000, maxUsd: 4500 });
  });
  it('parses "from" in UAH and converts', () => {
    expect(parseSalary('від 41 500 грн')).toEqual({ minUsd: 1000, maxUsd: null });
  });
  it('parses "up to" with currency after number', () => {
    expect(parseSalary('до 3000 $')).toEqual({ minUsd: null, maxUsd: 3000 });
  });
  it('converts annual amounts to monthly', () => {
    expect(parseSalary('$120k - $150k')).toEqual({ minUsd: 10000, maxUsd: 12500 });
    expect(parseSalary('98500 - 164000 USD', 'year')).toEqual({ minUsd: 8208, maxUsd: 13667 });
  });
  it('handles EUR', () => {
    expect(parseSalary('€4,000')).toEqual({ minUsd: 4320, maxUsd: 4320 });
  });
  it('returns null when nothing parseable', () => {
    expect(parseSalary('competitive')).toBeNull();
  });
});
