-- Plan 6c: company job boards (ATS) and public Telegram channels as sources.
insert into public.sources (id, name, kind, min_interval_minutes) values
  ('greenhouse', 'Greenhouse boards', 'api', 360),
  ('lever', 'Lever boards', 'api', 360),
  ('ashby', 'Ashby boards', 'api', 360),
  ('workable', 'Workable boards', 'api', 360),
  ('telegram', 'Telegram channels', 'html', 180)
on conflict (id) do nothing;

create table public.source_boards (
  source_id text not null references public.sources (id),
  slug text not null check (slug ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{1,60}$'),
  name text,
  enabled boolean not null default true,
  origin text not null default 'seed' check (origin in ('seed', 'discovered')),
  failures int not null default 0,
  last_ok_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (source_id, slug)
);
revoke all on public.source_boards from anon, authenticated;
alter table public.source_boards enable row level security;

-- Seed: verified 2026-10-07 to return jobs from the public API.
insert into public.source_boards (source_id, slug, name) values
  -- Ukrainian product companies
  ('ashby', 'preply', 'Preply'), ('ashby', 'genesis', 'Genesis'), ('ashby', 'headway', 'Headway'),
  ('ashby', 'universe', 'Universe'), ('ashby', 'obrio', 'OBRIO'), ('ashby', 'boosters', 'Boosters'),
  ('lever', 'ajax', 'Ajax Systems'), ('lever', 'kyivstar', 'Kyivstar'), ('lever', 'eleks', 'ELEKS'),
  -- Remote-friendly product companies
  ('greenhouse', 'gitlab', 'GitLab'), ('greenhouse', 'grafanalabs', 'Grafana Labs'), ('greenhouse', 'elastic', 'Elastic'),
  ('greenhouse', 'mongodb', 'MongoDB'), ('greenhouse', 'datadog', 'Datadog'), ('greenhouse', 'contentful', 'Contentful'),
  ('greenhouse', 'samsara', 'Samsara'), ('greenhouse', 'figma', 'Figma'), ('greenhouse', 'intercom', 'Intercom'),
  ('greenhouse', 'twilio', 'Twilio'), ('greenhouse', 'duolingo', 'Duolingo'), ('greenhouse', 'coinbase', 'Coinbase'),
  ('greenhouse', 'discord', 'Discord'), ('greenhouse', 'reddit', 'Reddit'), ('greenhouse', 'cloudflare', 'Cloudflare'),
  ('greenhouse', 'okta', 'Okta'), ('greenhouse', 'mattermost', 'Mattermost'),
  ('lever', 'spotify', 'Spotify'), ('lever', 'outreach', 'Outreach'),
  ('ashby', 'posthog', 'PostHog'), ('ashby', 'supabase', 'Supabase'), ('ashby', 'linear', 'Linear'),
  ('ashby', 'n8n', 'n8n'), ('ashby', 'sentry', 'Sentry'), ('ashby', 'ramp', 'Ramp'), ('ashby', 'notion', 'Notion'),
  ('ashby', 'resend', 'Resend'), ('ashby', 'replit', 'Replit'), ('ashby', 'elevenlabs', 'ElevenLabs'),
  ('ashby', 'cursor', 'Cursor'), ('ashby', 'clickhouse', 'ClickHouse'), ('ashby', 'checkly', 'Checkly'),
  ('ashby', 'infisical', 'Infisical'),
  ('workable', 'modash', 'Modash'), ('workable', 'portswigger', 'PortSwigger'),
  -- Public Telegram channels with job posts
  ('telegram', 'job_it_junior', 'Don''t Panic Junior IT Jobs'), ('telegram', 'itexpert_vacancies', 'ITExpert Vacancies'),
  ('telegram', 'rabotafrontend', 'FrontEnd Работа'), ('telegram', 'job_react', 'React Jobs'),
  ('telegram', 'juno_jobs', 'Juno Jobs'), ('telegram', 'jobs_juniors_remote', 'Remote jobs for juniors')
on conflict do nothing;
