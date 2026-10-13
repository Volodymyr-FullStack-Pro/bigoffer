-- What a recruiter's reply was, so the board can colour cards by it: an automatic "we got your application"
-- is not a real answer, an interview invite is.
alter table public.application_messages drop constraint application_messages_ai_classification_check;
alter table public.application_messages add constraint application_messages_ai_classification_check
  check (ai_classification in ('auto_reply', 'question', 'interview_invite', 'test_task', 'offer', 'rejection', 'other'));

alter table public.applications
  add column reply_kind text check (reply_kind in ('auto_reply', 'question', 'interview_invite', 'test_task', 'offer', 'rejection', 'other'));
grant update (reply_kind) on public.applications to authenticated;
