-- Job families a search profile wants (frontend, fullstack, backend, …). Empty = derived from the keywords in the app.
alter table public.search_profiles
  add column target_roles text[] not null default '{}'
    check (target_roles <@ array['frontend', 'fullstack', 'backend', 'mobile', 'devops', 'qa', 'data', 'design', 'management', 'support']::text[]);
