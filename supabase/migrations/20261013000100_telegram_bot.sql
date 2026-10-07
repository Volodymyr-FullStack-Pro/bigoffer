-- Plan 6b: Telegram bot — linking tokens, alert settings, notified marks, bot board action.

create table public.telegram_link_tokens (
  token_hash text primary key,
  user_id uuid not null references auth.users on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index telegram_link_tokens_user on public.telegram_link_tokens (user_id);
alter table public.telegram_link_tokens enable row level security;
revoke all on public.telegram_link_tokens from public, anon, authenticated;
grant select, insert, update, delete on public.telegram_link_tokens to service_role;
comment on table public.telegram_link_tokens is 'One-time /start tokens (sha256 hashes) for linking a Telegram chat; server-only.';

alter table public.profiles
  add column telegram_alerts boolean not null default true,
  add column telegram_min_score smallint not null default 75 check (telegram_min_score between 0 and 100),
  add column digest_last_sent_on date;
comment on column public.profiles.digest_last_sent_on is 'Server-only: local date of the last Telegram digest.';

-- users edit the alert settings; telegram_chat_id and digest_last_sent_on stay server-only
grant update (telegram_alerts, telegram_min_score) on public.profiles to authenticated;

alter table public.job_matches add column notified_at timestamptz;
comment on column public.job_matches.notified_at is 'Server-only: when the Telegram alert for this match was sent.';

create or replace function public.create_telegram_link_token(p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  delete from public.telegram_link_tokens where user_id = v_uid;
  insert into public.telegram_link_tokens (token_hash, user_id, expires_at)
  values (p_token_hash, v_uid, now() + interval '15 minutes');
end $$;
revoke execute on function public.create_telegram_link_token(text) from public, anon;
grant execute on function public.create_telegram_link_token(text) to authenticated;

create or replace function public.unlink_telegram()
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  update public.profiles set telegram_chat_id = null where id = v_uid;
end $$;
revoke execute on function public.unlink_telegram() from public, anon;
grant execute on function public.unlink_telegram() to authenticated;

create or replace function public.link_telegram(p_token_hash text, p_chat_id bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  delete from public.telegram_link_tokens
  where token_hash = p_token_hash and expires_at > now()
  returning user_id into v_user;
  if v_user is null then return null; end if;
  -- one chat, one account
  update public.profiles set telegram_chat_id = null where telegram_chat_id = p_chat_id and id <> v_user;
  update public.profiles set telegram_chat_id = p_chat_id where id = v_user;
  return v_user;
end $$;
revoke execute on function public.link_telegram(text, bigint) from public, anon, authenticated;
grant execute on function public.link_telegram(text, bigint) to service_role;

-- The bot acts on behalf of a user: impersonate via the JWT claim for this transaction only, then reuse the
-- web action. save_match_to_board is security invoker and filters every query by auth.uid(), so a foreign
-- match raises 'match not found'. This function runs as its owner (bypasses RLS), which is why the
-- explicit auth.uid() filters in save_match_to_board are what enforce ownership.
create or replace function public.bot_save_match(p_user_id uuid, p_match_id uuid, p_column_key text, p_rank text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_app uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  select s.application_id into v_app from public.save_match_to_board(p_match_id, p_column_key, p_rank) s;
  return v_app;
end $$;
revoke execute on function public.bot_save_match(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.bot_save_match(uuid, uuid, text, text) to service_role;
