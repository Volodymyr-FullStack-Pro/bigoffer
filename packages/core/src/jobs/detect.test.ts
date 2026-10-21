import { describe, expect, it } from 'vitest';
import { detectRemote, detectSeniority, parseSalary, remoteRuledOut } from './detect';

describe('detectRemote', () => {
  it.each([
    ['Fully remote, work from anywhere', 'remote'],
    ['Київ, віддалено', 'remote'],
    ['Удаленная работа', 'remote'],
    ['Hybrid: 2 days in office', 'hybrid'],
    ['Офіс у Львові', 'office'],
    ['On-site in Berlin', 'office'],
    ['Great team', 'unknown'],
    ['not remote', 'unknown'],
    ['No remote, office in Kyiv', 'office'],
    ['non-remote position', 'unknown'],
    ['remote control systems', 'unknown'],
    ['Hybrid cloud engineer', 'unknown'],
    ['MS Office, Office 365, Microsoft Office', 'unknown'],
    ['Anywhere you like', 'unknown'],
    ['Work from anywhere', 'remote'],
    ['anywhere in the world', 'remote'],
    ['Видалення дублікатів, удаление данных', 'unknown'],
    ['Удалённая работа', 'remote'],
    ['Повна зайнятість в офісі в Харкові. ВАЖЛИВО! ЧАСТКОВУ та ДИСТАНЦІЙНУ ЗАЙНЯТІСТЬ НЕ РОЗГЛЯДАЄМО', 'office'],
    ['Удаленную работу не рассматриваем, офис в Киеве', 'office'],
    ['Remote work is not possible. Office in Lviv', 'office'],
    ['Работа только в офисе, гибрид обсуждается', 'office'],
    ['Віддалено, офіс у Києві за бажанням', 'remote'],
  ] as const)('%s → %s', (text, expected) => {
    expect(detectRemote(text)).toBe(expected);
  });
});

describe('remoteRuledOut', () => {
  it('sees a text that rules remote out', () => {
    expect(remoteRuledOut('ЧАСТКОВУ та ДИСТАНЦІЙНУ ЗАЙНЯТІСТЬ НЕ РОЗГЛЯДАЄМО')).toBe(true);
    expect(remoteRuledOut('Работа только в офисе')).toBe(true);
  });
  it('leaves a text that only mentions an office alone', () => {
    expect(remoteRuledOut('Сучасний офіс у Києві та робочий MacBook')).toBe(false);
    expect(remoteRuledOut('Fully remote team')).toBe(false);
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
    ['Lead generation manager', null],
    ['Staff accountant', null],
    ['Mid-Market Account Executive', null],
    ['Staff Software Engineer', 'lead'],
    ['Tech Lead', 'lead'],
    ['Head of Sales', 'lead'],
    ['Middleware engineer', null],
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
  it('treats an implausibly small "yearly" salary as already monthly', () => {
    expect(parseSalary('3820 - 4497 USD', 'year')).toEqual({ minUsd: 3820, maxUsd: 4497 });
    expect(parseSalary('up to 4000 USD', 'year')).toEqual({ minUsd: null, maxUsd: 4000 });
  });
  it('drops the max of an implausibly wide range', () => {
    expect(parseSalary('190000 - 1700000 USD', 'year')).toEqual({ minUsd: 15833, maxUsd: null });
    expect(parseSalary('$1000 - $5000')).toEqual({ minUsd: 1000, maxUsd: null });
    expect(parseSalary('$1000 - $4000')).toEqual({ minUsd: 1000, maxUsd: 4000 });
  });
  it('drops salaries above $100k a month', () => {
    expect(parseSalary('1500000 - 2000000 USD', 'month')).toBeNull();
    expect(parseSalary('5000000 USD', 'year')).toBeNull();
  });
  it('handles EUR', () => {
    expect(parseSalary('€4,000')).toEqual({ minUsd: 4320, maxUsd: 4320 });
  });
  it('returns null when nothing parseable', () => {
    expect(parseSalary('competitive')).toBeNull();
  });
  it('applies a shared trailing k to the whole range', () => {
    expect(parseSalary('30-40k EUR/year')).toEqual({ minUsd: 2700, maxUsd: 3600 });
    expect(parseSalary('5-7k $')).toEqual({ minUsd: 5000, maxUsd: 7000 });
  });
  it('decides annual once per salary', () => {
    expect(parseSalary('$18k - $25k')).toEqual({ minUsd: 1500, maxUsd: 2083 });
  });
  it('does not mistake Europe for EUR', () => {
    expect(parseSalary('3000 USD, Europe')).toEqual({ minUsd: 3000, maxUsd: 3000 });
  });
  it('reads a decimal comma or point before k', () => {
    expect(parseSalary('$35,3k- $52k')).toEqual({ minUsd: 2942, maxUsd: 4333 });
    expect(parseSalary('$35.3k - $52k')).toEqual({ minUsd: 2942, maxUsd: 4333 });
  });
  it.each(['$90 - $150 /hour', '$60 per hour', '$70/hr', 'hourly $50-60', '300 грн в годину', '500 руб в час'])(
    'does not guess hourly rates: %s',
    (raw) => {
      expect(parseSalary(raw)).toBeNull();
    },
  );
  it.each(['50000 - 80000 MXN', '21000 - 35000 PLN', '£50k', '100k CHF', '₽200000', '120000 CAD', 'R$ 8000', '₹1500000'])(
    'returns null for unsupported currencies: %s',
    (raw) => {
      expect(parseSalary(raw)).toBeNull();
    },
  );
  it('swaps a reversed range', () => {
    expect(parseSalary('$4500 - $3000')).toEqual({ minUsd: 3000, maxUsd: 4500 });
  });
});
