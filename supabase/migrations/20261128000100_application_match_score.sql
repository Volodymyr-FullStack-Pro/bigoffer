-- Match score of a card saved by link from a site we do not parse (a LinkedIn post, a company page).
-- Board jobs keep their score in job_matches; this one is computed once, when the card is created.
alter table public.applications
  add column match_score smallint check (match_score between 0 and 100);
