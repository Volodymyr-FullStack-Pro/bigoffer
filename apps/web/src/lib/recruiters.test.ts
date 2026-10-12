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
      { kind: 'linkedin', label: 'olena petrenko', href: 'https://www.linkedin.com/in/olena-petrenko-1a2b3c4d', posted: true },
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

describe('rankRecruiters', () => {
  it('treats people found by company as current and puts sourcers first', async () => {
    const { rankRecruiters } = await import('./recruiters');
    // The Newxel case: headlines carry only the role, the company is in the snippet.
    const found = recruitersFromResults(
      [
        { title: 'Olga Alekseeva - Talent Acquisition Lead | LinkedIn', url: 'https://www.linkedin.com/in/olga', description: 'Experience: Newxel · Location: Kyiv' },
        { title: 'Oksana Niechaieva - Talent Acquisition Specialist | LinkedIn', url: 'https://www.linkedin.com/in/oksana', description: 'Talent Acquisition Specialist at Newxel' },
        { title: 'Solomiia Letsiuk - Talent Sourcer | LinkedIn', url: 'https://www.linkedin.com/in/solomiia', description: 'Experience: Newxel · Education: LNU' },
      ],
      'Newxel',
    );
    const ranked = rankRecruiters(found);
    expect(ranked.map((r) => r.label)).toEqual(['Oksana Niechaieva', 'Solomiia Letsiuk', 'Olga Alekseeva']);
    expect(ranked.every((r) => r.current)).toBe(true);
    expect(ranked[0]).toMatchObject({ best: true });
  });
  it('puts people the result names as past employees last', async () => {
    const { rankRecruiters } = await import('./recruiters');
    const found = recruitersFromResults(
      [
        { title: 'Anna K - Recruiter | LinkedIn', url: 'https://www.linkedin.com/in/anna', description: 'Recruiter at SoftServe. Ex-Newxel' },
        { title: 'Olena P - Talent Sourcer - Newxel | LinkedIn', url: 'https://www.linkedin.com/in/olena' },
        { title: 'Iryna B - HR | LinkedIn', url: 'https://www.linkedin.com/in/iryna', description: 'Former recruiter at Newxel' },
      ],
      'Newxel',
    );
    const ranked = rankRecruiters(found);
    expect(ranked.map((r) => [r.label, r.current])).toEqual([['Olena P', true], ['Anna K', false], ['Iryna B', false]]);
    expect(ranked[0]).toMatchObject({ best: true });
  });
  it('treats cached contacts without the flag as current', async () => {
    const { rankRecruiters } = await import('./recruiters');
    const ranked = rankRecruiters([
      { kind: 'linkedin', label: 'Olga', title: 'Talent Acquisition Lead', href: 'https://www.linkedin.com/in/olga' },
      { kind: 'linkedin', label: 'Solomiia', title: 'Talent Sourcer', href: 'https://www.linkedin.com/in/solomiia' },
    ]);
    expect(ranked.map((r) => [r.label, r.current, r.best])).toEqual([['Solomiia', true, true], ['Olga', true, false]]);
  });
  it('puts a LinkedIn profile named in the posting above recruiters found by search', async () => {
    const { rankRecruiters } = await import('./recruiters');
    const own = contactsFromDescription('Questions: https://www.linkedin.com/in/olena-petrenko');
    const ranked = rankRecruiters([
      { kind: 'linkedin', label: 'Anna', title: 'Talent Sourcer', href: 'https://www.linkedin.com/in/anna' },
      ...own,
    ]);
    expect(ranked.map((r) => [r.label, r.best])).toEqual([['olena petrenko', true], ['Anna', false]]);
  });
  it('puts a contact named in the posting first', async () => {
    const { rankRecruiters } = await import('./recruiters');
    const ranked = rankRecruiters([
      { kind: 'linkedin', label: 'Anna', title: 'Recruiter · Acme', href: 'https://www.linkedin.com/in/anna' },
      { kind: 'email', label: 'hr@acme.io', href: 'mailto:hr@acme.io' },
    ]);
    expect(ranked[0]).toMatchObject({ kind: 'email', best: true });
  });
});
