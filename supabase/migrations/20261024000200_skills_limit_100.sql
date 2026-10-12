-- Up to 100 skills per search profile (was 30): a long list does not dilute the score (skill credit saturates at
-- six matches), so users can list everything they know.
alter table public.search_profiles drop constraint search_profiles_skills_count;
alter table public.search_profiles add constraint search_profiles_skills_count check (cardinality(skills) <= 100);
