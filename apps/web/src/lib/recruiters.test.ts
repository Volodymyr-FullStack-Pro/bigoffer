import { describe, expect, it } from 'vitest';
import { companyKey, contactsFromDescription, hrContactsFromResults, recruiterQuery, recruitersFromResults } from './recruiters';

describe('companyKey', () => {
  it('drops legal forms and punctuation', () => {
    expect(companyKey('SoftServe Inc.')).toBe('softserve');
    expect(companyKey('ТОВ "Розетка"')).toBe('розетка');
    expect(companyKey('Grid Dynamics')).toBe('grid dynamics');
  });
});

describe('contactsFromDescription', () => {
  it('finds e-mails, Telegram handles and LinkedIn profiles, skipping no-reply addresses', () => {
    const text = `<p>Send your CV to <b>Anna.HR@acme.io</b> or Telegram: @anna_recruits.</p>
      Questions: https://www.linkedin.com/in/olena-petrenko-1a2b3c4d/ · noreply@acme.io`;
    expect(contactsFromDescription(text)).toEqual([
      { kind: 'email', label: 'anna.hr@acme.io', href: 'mailto:anna.hr@acme.io' },
      { kind: 'telegram', label: '@anna_recruits', href: 'https://t.me/anna_recruits' },
      { kind: 'linkedin', label: 'olena petrenko', href: 'https://www.linkedin.com/in/olena-petrenko-1a2b3c4d' },
    ]);
  });
  it('returns nothing for a plain description', () => {
    expect(contactsFromDescription('React, TypeScript, 3+ years')).toEqual([]);
  });
});

describe('recruitersFromResults', () => {
  const results = [
    { title: 'Olena Petrenko - Talent Acquisition Partner - SoftServe | LinkedIn', url: 'https://ua.linkedin.com/in/olena-petrenko' },
    { title: 'Ivan Shevchenko - Senior Java Developer - SoftServe | LinkedIn', url: 'https://ua.linkedin.com/in/ivan-s' },
    { title: 'Maria K. - Recruiter - EPAM Systems | LinkedIn', url: 'https://www.linkedin.com/in/maria-k' },
    { title: 'Iryna Bondar – HR Manager | LinkedIn', url: 'https://www.linkedin.com/in/iryna-b', description: 'HR Manager at SoftServe Inc. Lviv' },
    { title: 'SoftServe careers', url: 'https://www.softserveinc.com/careers' },
  ];
  it('keeps recruiting profiles of this company only', () => {
    expect(recruitersFromResults(results, 'SoftServe Inc.')).toEqual([
      { kind: 'linkedin', label: 'Olena Petrenko', title: 'Talent Acquisition Partner · SoftServe', href: 'https://www.linkedin.com/in/olena-petrenko' },
      { kind: 'linkedin', label: 'Iryna Bondar', title: 'HR Manager', href: 'https://www.linkedin.com/in/iryna-b' },
    ]);
  });
  it('builds a LinkedIn-profile query', () => {
    expect(recruiterQuery(' Acme ')).toBe('site:linkedin.com/in "Acme" (recruiter OR "talent acquisition" OR HR OR рекрутер)');
  });
});

describe('hrContactsFromResults', () => {
  it('keeps HR mailboxes and recruiters\' Telegram handles of this company only', () => {
    const results = [
      { title: 'Контакти — SoftServe', url: 'https://softserve.ua/contacts', description: 'SoftServe: info@softserve.com, вакансії: hr@softserve.com' },
      { title: 'SoftServe на DOU', url: 'https://jobs.dou.ua/companies/softserve/', description: 'Рекрутер SoftServe — Telegram: @olena_hr_ss' },
      { title: 'Acme jobs', url: 'https://acme.io', description: 'Write to jobs@acme.io' },
      { title: 'SoftServe news', url: 'https://news.example', description: 'Telegram: @softserve_news' },
    ];
    expect(hrContactsFromResults(results, 'SoftServe')).toEqual([
      { kind: 'email', label: 'hr@softserve.com', href: 'mailto:hr@softserve.com' },
      { kind: 'telegram', label: '@olena_hr_ss', href: 'https://t.me/olena_hr_ss' },
    ]);
  });
});
