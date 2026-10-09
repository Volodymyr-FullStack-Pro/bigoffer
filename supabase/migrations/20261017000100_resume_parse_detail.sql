-- Sanitized reason of the last failed CV parse (error name, HTTP status, first 200 chars; never CV text or keys),
-- so a failure can be diagnosed without runtime logs.
alter table public.resumes add column parse_error_detail text check (char_length(parse_error_detail) <= 400);
grant update (parse_error_detail) on public.resumes to authenticated;
