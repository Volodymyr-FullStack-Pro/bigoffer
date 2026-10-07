import { SOURCE_CATALOG } from '@jp/core';

const BASE = 'https://www.linkedin.com/search/results/people/?keywords=';

/** Adapters without a real company fill in the source name (companyIsPlaceholder is not stored). */
const PLACEHOLDERS: ReadonlySet<string> = new Set(SOURCE_CATALOG.map((s) => s.name.toLowerCase()));

export function peopleSearchLinks(company: string): { recruiters: string; engineers: string } {
  const name = company.trim();
  return {
    recruiters: `${BASE}${encodeURIComponent(`${name} recruiter`)}`,
    engineers: `${BASE}${encodeURIComponent(`${name} engineering manager`)}`,
  };
}

export function hasRealCompany(company: string | null | undefined): company is string {
  const name = company?.trim().toLowerCase();
  return Boolean(name) && !PLACEHOLDERS.has(name as string);
}
