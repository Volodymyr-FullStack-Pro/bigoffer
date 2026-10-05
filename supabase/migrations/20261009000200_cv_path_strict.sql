-- Plan 6a fix: CV path is strictly <user_id>/<uuid>.pdf (table check + storage policies); bucket idempotently private.

alter table public.resumes
  drop constraint resumes_path_owner,
  add constraint resumes_path_owner
    check (storage_path ~ ('^' || user_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'));

drop policy "own cv files read" on storage.objects;
drop policy "own cv files insert" on storage.objects;
drop policy "own cv files delete" on storage.objects;

create policy "own cv files read" on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$');
create policy "own cv files insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$');
create policy "own cv files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = (select auth.uid())::text
    and array_length(storage.foldername(name), 1) = 1
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$');

update storage.buckets set public = false, file_size_limit = 5242880, allowed_mime_types = array['application/pdf']
where id = 'resumes';
