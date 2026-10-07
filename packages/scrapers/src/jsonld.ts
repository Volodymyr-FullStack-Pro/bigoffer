type LdAddress = {
  addressLocality?: string | string[] | null;
  addressRegion?: string | string[] | null;
  addressCountry?: string | { name?: string } | null;
};

type LdArea = { address?: LdAddress; name?: string };

export type JobPostingLd = {
  '@type'?: string;
  title?: string;
  url?: string;
  identifier?: string | number | { value?: string | number };
  description?: string;
  datePosted?: string;
  hiringOrganization?: { name?: string };
  jobLocationType?: string;
  applicantLocationRequirements?: LdArea | LdArea[];
  jobLocation?: { address?: LdAddress } | { address?: LdAddress }[];
  employmentType?: string | string[];
};

export function extractJobPostings(html: string): JobPostingLd[] {
  const out: JobPostingLd[] = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(m[1]!);
    } catch {
      continue;
    }
    for (const node of Array.isArray(data) ? data : [data]) {
      if (node && typeof node === 'object' && (node as JobPostingLd)['@type'] === 'JobPosting') {
        out.push(node as JobPostingLd);
      }
    }
  }
  return out;
}

const first = (v: string | string[] | null | undefined): string | null =>
  (Array.isArray(v) ? v.find(Boolean) : v) || null;

function addressText(a: LdAddress | undefined): string | null {
  if (!a) return null;
  const country = typeof a.addressCountry === 'object' ? a.addressCountry?.name : a.addressCountry;
  return first(a.addressLocality) || first(a.addressRegion) || country || null;
}

export function ldLocation(p: JobPostingLd): string | null {
  const jobLoc = Array.isArray(p.jobLocation) ? p.jobLocation[0] : p.jobLocation;
  const area = Array.isArray(p.applicantLocationRequirements)
    ? p.applicantLocationRequirements[0]
    : p.applicantLocationRequirements;
  return addressText(jobLoc?.address) ?? addressText(area?.address) ?? area?.name ?? null;
}
