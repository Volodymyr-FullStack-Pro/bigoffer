-- Jobs pipeline (Plan 2). Convention: explicit revoke → grant → RLS on every table.
create extension if not exists pg_trgm with schema extensions;

alter table public.sources add column consecutive_empty_runs int not null default 0;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text not null unique,
  website text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  title text not null,
  company_id uuid not null references public.companies (id),
  description_text text not null default '',
  location text,
  remote_type text not null default 'unknown'
    check (remote_type in ('remote', 'hybrid', 'office', 'unknown')),
  seniority text check (seniority in ('intern', 'junior', 'middle', 'senior', 'lead')),
  salary_raw text,
  salary_min_usd int,
  salary_max_usd int,
  tags text[] not null default '{}',
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'expired')),
  -- AI enrichment (Plan 3)
  role_id uuid references public.roles (id),
  skills text[] not null default '{}',
  lang text,
  summary jsonb,
  enriched_at timestamptz,
  enrich_error text
);
create index jobs_title_trgm on public.jobs using gin (title extensions.gin_trgm_ops);
create index jobs_status_first_seen on public.jobs (status, first_seen_at desc);
create index jobs_company_first_seen on public.jobs (company_id, first_seen_at desc);

create table public.job_postings (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs (id) on delete cascade,
  source_id text not null references public.sources (id),
  external_id text not null,
  url text not null,
  seen_at timestamptz not null default now(),
  unique (source_id, external_id)
);
create index job_postings_job on public.job_postings (job_id);

create table public.search_queries (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources (id),
  query_key text not null unique,
  params jsonb not null default '{}',
  last_run_at timestamptz,
  next_run_at timestamptz not null default now()
);

create table public.source_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.sources (id),
  query_id uuid references public.search_queries (id) on delete set null,
  status text not null default 'running' check (status in ('running', 'ok', 'error', 'blocked')),
  found int not null default 0,
  inserted int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index source_runs_source_started on public.source_runs (source_id, started_at desc);

create table public.search_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  role_id uuid references public.roles (id),
  keywords text[] not null default '{}',
  skills text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  seniority text[] not null default '{}',
  locations text[] not null default '{}',
  remote_type text not null default 'any' check (remote_type in ('remote', 'hybrid', 'office', 'any')),
  salary_min_usd int check (salary_min_usd is null or salary_min_usd >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index search_profiles_user on public.search_profiles (user_id);
create trigger search_profiles_updated_at before update on public.search_profiles
  for each row execute function public.set_updated_at();

create table public.search_profile_queries (
  search_profile_id uuid not null references public.search_profiles (id) on delete cascade,
  search_query_id uuid not null references public.search_queries (id) on delete cascade,
  primary key (search_profile_id, search_query_id)
);
create index search_profile_queries_query on public.search_profile_queries (search_query_id);

create table public.job_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  job_id uuid not null references public.jobs (id) on delete cascade,
  search_profile_id uuid references public.search_profiles (id) on delete set null,
  score smallint not null check (score between 0 and 100),
  breakdown jsonb not null default '{}',
  explanation jsonb,
  state text not null default 'new' check (state in ('new', 'seen', 'hidden', 'saved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_id)
);
create index job_matches_feed on public.job_matches (user_id, state, created_at desc);
create trigger job_matches_updated_at before update on public.job_matches
  for each row execute function public.set_updated_at();

-- grants
revoke all on public.companies, public.jobs, public.job_postings, public.search_queries,
  public.source_runs, public.search_profiles, public.search_profile_queries, public.job_matches
  from anon, authenticated;
grant select on public.companies, public.jobs, public.job_postings to authenticated;
grant select, insert, update, delete on public.search_profiles to authenticated;
grant select on public.job_matches to authenticated;
grant update (state) on public.job_matches to authenticated;

-- RLS
alter table public.companies enable row level security;
alter table public.jobs enable row level security;
alter table public.job_postings enable row level security;
alter table public.search_queries enable row level security;
alter table public.source_runs enable row level security;
alter table public.search_profiles enable row level security;
alter table public.search_profile_queries enable row level security;
alter table public.job_matches enable row level security;

create policy "companies readable" on public.companies for select to authenticated using (true);
create policy "jobs readable" on public.jobs for select to authenticated using (true);
create policy "postings readable" on public.job_postings for select to authenticated using (true);
create policy "own search profiles" on public.search_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own matches select" on public.job_matches for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own matches update" on public.job_matches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- dedupe helper: same company, near-identical title, seen in the last 14 days
create or replace function public.find_similar_job(p_company_id uuid, p_title text)
returns uuid language sql stable set search_path = '' as $$
  select j.id
  from public.jobs j
  where j.company_id = p_company_id
    and j.first_seen_at > now() - interval '14 days'
    and extensions.similarity(j.title, p_title) > 0.9
  order by extensions.similarity(j.title, p_title) desc
  limit 1
$$;
revoke execute on function public.find_similar_job(uuid, text) from public, anon, authenticated;
