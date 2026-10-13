-- Replies also arrive in the DOU and robota.ua inboxes, not only Djinni's.
alter table public.application_messages drop constraint application_messages_channel_check;
alter table public.application_messages add constraint application_messages_channel_check
  check (channel in ('email', 'linkedin', 'djinni', 'dou', 'robotaua', 'telegram', 'call', 'other'));
