-- Atomic report replacement and erasure. Apply after 0001 and 0002.
alter table public.facts add column if not exists ref_low_inclusive boolean not null default true;
alter table public.facts add column if not exists ref_high_inclusive boolean not null default true;

-- Preserve multiple same-day readings; the analyzer handles ambiguity explicitly.
drop index if exists public.facts_unique_reading;
create unique index if not exists documents_id_user_unique on public.documents(id, user_id);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'facts_document_owner_fk' and conrelid = 'public.facts'::regclass) then
    alter table public.facts add constraint facts_document_owner_fk
      foreign key (doc_id, user_id) references public.documents(id, user_id) on delete cascade not valid;
  end if;
end $$;

create or replace function public.save_report(report jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  report_id uuid;
  reading jsonb;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(report->'facts') is distinct from 'array'
     or coalesce(length(report->>'sourceId'), 0) = 0 then
    raise exception 'Invalid report';
  end if;
  if jsonb_array_length(report->'facts') < 1 or jsonb_array_length(report->'facts') > 5000 then
    raise exception 'Invalid number of results';
  end if;
  insert into public.documents(user_id, source_id, title, source_name, doc_date, hospital, doctor, fact_count)
  values(owner_id, report->>'sourceId', coalesce(nullif(report->>'documentTitle', ''), 'Report'),
    coalesce(report->>'sourceName', ''), coalesce(nullif(report->>'documentDate', ''), report->'facts'->0->>'date')::date,
    coalesce(report->>'hospital', ''), coalesce(report->>'doctor', ''), jsonb_array_length(report->'facts'))
  on conflict(user_id, source_id) do update set
    title = excluded.title, source_name = excluded.source_name, doc_date = excluded.doc_date,
    hospital = excluded.hospital, doctor = excluded.doctor, fact_count = excluded.fact_count
  returning id into report_id;
  -- The upsert locks the document until all facts have been replaced.
  delete from public.facts where doc_id = report_id and user_id = owner_id;
  for reading in select value from jsonb_array_elements(report->'facts') loop
    if coalesce(length(trim(reading->>'analyte')), 0) = 0
       or jsonb_typeof(reading->'value') is distinct from 'number'
       or coalesce(reading->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'Invalid measurement';
    end if;
    if (reading->>'refLow')::double precision > (reading->>'refHigh')::double precision then
      raise exception 'Reversed reference range';
    end if;
    insert into public.facts(user_id, doc_id, measured_on, analyte, analyte_printed, value, unit,
      ref_low, ref_high, ref_low_inclusive, ref_high_inclusive, doctor, hospital)
    values(owner_id, report_id, (reading->>'date')::date, trim(reading->>'analyte'),
      coalesce(reading->>'analyteAsPrinted', ''), (reading->>'value')::double precision,
      coalesce(reading->>'unit', ''), (reading->>'refLow')::double precision, (reading->>'refHigh')::double precision,
      coalesce((reading->>'refLowInclusive')::boolean, true), coalesce((reading->>'refHighInclusive')::boolean, true),
      coalesce(reading->>'doctor', ''), coalesce(reading->>'hospital', ''));
  end loop;
  return report_id;
end $$;

create or replace function public.erase_my_records()
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  delete from public.documents where user_id = auth.uid();
  delete from public.messages where user_id = auth.uid();
end $$;
revoke all on function public.save_report(jsonb) from public, anon;
revoke all on function public.erase_my_records() from public, anon;
grant execute on function public.save_report(jsonb) to authenticated;
grant execute on function public.erase_my_records() to authenticated;
