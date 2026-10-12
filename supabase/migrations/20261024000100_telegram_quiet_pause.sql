-- Telegram alerts: quiet hours in the user's time zone (no messages at night; what arrived waits for the morning)
-- and a pause (/pause in the bot, or the profile). Both editable by the user.
alter table public.profiles
  add column telegram_quiet_start smallint not null default 23 check (telegram_quiet_start between 0 and 23),
  add column telegram_quiet_end smallint not null default 8 check (telegram_quiet_end between 0 and 23),
  add column telegram_paused_until timestamptz;
grant update (telegram_quiet_start, telegram_quiet_end, telegram_paused_until) on public.profiles to authenticated;
