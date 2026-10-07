-- ============ explicit grants ============
-- Convention for EVERY table in `public` (this and future migrations):
--   1. `revoke all on <table> from anon, authenticated;`  -- never rely on Supabase default grants
--   2. `grant <only the needed privileges> on <table> to authenticated;` (column-level for partial updates)
--   3. `alter table <table> enable row level security;` + policies scoped to `(select auth.uid())`.
-- `service_role` keeps its default privileges (server-side jobs only).
-- SECURITY DEFINER functions: `revoke execute ... from public, anon, authenticated` unless meant to be RPCs.

revoke all on public.roles, public.skills, public.sources, public.profiles,
  public.board_columns, public.labels
  from anon, authenticated;

-- global reference data: read-only for signed-in users
grant select on public.roles, public.skills, public.sources to authenticated;

-- profiles: rows are created by handle_new_user(); users may read and edit an allow-list of columns
grant select on public.profiles to authenticated;
grant update (full_name, locale, timezone, digest_hour, contacts, follow_up_days,
              ghost_after_days, onboarded_at)
  on public.profiles to authenticated;

-- per-user data: full CRUD, row access enforced by RLS
grant select, insert, update, delete on public.board_columns, public.labels to authenticated;

-- trigger-only function
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 128-bit random inbound email token (pgcrypto lives in `extensions` on Supabase)
alter table public.profiles
  alter column inbound_email_token set default encode(extensions.gen_random_bytes(16), 'hex');
