-- DOU feed titles carry the salary and legal-form tails after the company ("..., Inc., $400–800, Київ"); the old
-- parser took them as location parts. Drop those parts from stored locations; the next scrape fills the salary.
update public.jobs j
   set location = nullif(array_to_string(array(
         select x from unnest(string_to_array(replace(j.location, chr(160), ' '), ', ')) x
          where x !~* '^(від |до |from |up to )?[$€£₴]?\s*[0-9][0-9 ]*([–-]\s*[0-9][0-9 ]*)?\s*([$€£]|грн|uah|usd|eur)?$'
            and x !~* '^(inc|llc|ltd|limited|gmbh|corp|plc)\.?$'
       ), ', '), '')
 where (j.location ~ '[0-9]' or j.location ~* '^(inc|llc|ltd|limited|gmbh|corp|plc)\.?,')
   and exists (select 1 from public.job_postings p where p.job_id = j.id and p.source_id = 'dou');
