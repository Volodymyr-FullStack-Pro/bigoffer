-- ITLead (itlead.org): only the agency's own vacancies (?source=itlead listing + JSON-LD pages); re-posts are skipped.
insert into public.sources (id, name, kind, min_interval_minutes) values ('itlead', 'ITLead', 'html', 360)
on conflict (id) do nothing;
