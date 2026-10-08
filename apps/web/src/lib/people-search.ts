const BASE = 'https://www.linkedin.com/search/results/people/?keywords=';

export function peopleSearchLinks(company: string): { recruiters: string; engineers: string } {
  const name = company.trim();
  return {
    recruiters: `${BASE}${encodeURIComponent(`${name} recruiter`)}`,
    engineers: `${BASE}${encodeURIComponent(`${name} engineering manager`)}`,
  };
}

/** Company links make sense only for a real employer, not a source or channel name filled in by an adapter. */
export function canSearchPeople(company: string | null | undefined, isPlaceholder: boolean): boolean {
  return !isPlaceholder && Boolean(company?.trim());
}
