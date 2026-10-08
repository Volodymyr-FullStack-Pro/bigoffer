-- The adapter had no real company and used a source/channel name instead; the web hides company-based links then.
alter table public.jobs add column company_is_placeholder boolean not null default false;
