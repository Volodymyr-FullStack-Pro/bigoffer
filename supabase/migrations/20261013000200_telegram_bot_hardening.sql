-- Plan 6b task 1 review fixes.

-- one chat, one account — enforced, not just by link_telegram's order of operations
create unique index profiles_telegram_chat_id on public.profiles (telegram_chat_id) where telegram_chat_id is not null;

comment on column public.profiles.telegram_alerts is 'User setting: send Telegram alerts for new high-score matches.';
comment on column public.profiles.telegram_min_score is 'User setting: minimum match score (0-100) for a Telegram alert.';

create or replace function public.create_telegram_link_token(p_token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid token hash' using errcode = '22023';
  end if;
  delete from public.telegram_link_tokens where user_id = v_uid;
  insert into public.telegram_link_tokens (token_hash, user_id, expires_at)
  values (p_token_hash, v_uid, now() + interval '15 minutes');
end $$;

-- auth.uid() reads the legacy request.jwt.claim.sub first, then request.jwt.claims; set both, restore both.
create or replace function public.bot_save_match(p_user_id uuid, p_match_id uuid, p_column_key text, p_rank text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_app uuid;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  select s.application_id into v_app from public.save_match_to_board(p_match_id, p_column_key, p_rank) s;
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
  return v_app;
end $$;
