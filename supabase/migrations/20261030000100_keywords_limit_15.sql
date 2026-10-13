-- Up to 15 job titles per search profile (was 10): a full-stack CV maps to more than ten common titles.
alter table public.search_profiles drop constraint search_profiles_keywords_count;
alter table public.search_profiles
  add constraint search_profiles_keywords_count check (cardinality(keywords) between 1 and 15);
