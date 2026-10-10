-- Recruiters found per company by a web search (LinkedIn profiles), shared by every user who looks at the company's
-- vacancies. Written and read only by the web server's service role, refreshed after 30 days.
create table public.recruiter_lookups (
  company_key text primary key check (char_length(company_key) between 1 and 200),
  people jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);
revoke all on public.recruiter_lookups from anon, authenticated;
alter table public.recruiter_lookups enable row level security;
