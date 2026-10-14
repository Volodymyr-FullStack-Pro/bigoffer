-- A saved message can be corrected: where it came from, who wrote it, its text and its link (kept in ai_extracted).
-- The direction and time stay as logged.
grant update (channel, author, body, ai_extracted) on public.application_messages to authenticated;
