-- Up to 10 role keywords per search profile (was 5): other spellings are added automatically, so the slots go to
-- genuinely different titles.
alter table public.search_profiles drop constraint search_profiles_keywords_count;
alter table public.search_profiles
  add constraint search_profiles_keywords_count check (cardinality(keywords) between 1 and 10);
