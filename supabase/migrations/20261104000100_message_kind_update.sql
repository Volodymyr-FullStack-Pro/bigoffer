-- A saved company reply can be re-tagged (a plain answer that was really an auto-reply). Only the tag: the text,
-- sender and time of a message stay as logged.
grant update (ai_classification) on public.application_messages to authenticated;
