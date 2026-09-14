-- Replace the report writer after 0006 so an account can label each report
-- with one of its own family profiles. The ownership check is inside the
-- transaction; a profile ID from another account is never accepted.
create or replace function public.save_report(report jsonb)
returns uuid language plpgsql security invoker set search_path = ''
as $$
declare owner_id uuid := auth.uid(); report_id uuid; reading jsonb; person uuid := nullif(report->>'personId', '')::uuid;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(report->'facts') is distinct from 'array' or coalesce(length(report->>'sourceId'), 0) = 0 then raise exception 'Invalid report'; end if;
  if jsonb_array_length(report->'facts') < 1 or jsonb_array_length(report->'facts') > 5000 then raise exception 'Invalid number of results'; end if;
  if person is not null and not exists (select 1 from public.family_profiles where id = person and user_id = owner_id) then raise exception 'Invalid family member'; end if;
  insert into public.documents(user_id, person_id, source_id, title, source_name, doc_date, hospital, doctor, fact_count)
  values(owner_id, person, report->>'sourceId', coalesce(nullif(report->>'documentTitle', ''), 'Report'), coalesce(report->>'sourceName', ''), coalesce(nullif(report->>'documentDate', ''), report->'facts'->0->>'date')::date, coalesce(report->>'hospital', ''), coalesce(report->>'doctor', ''), jsonb_array_length(report->'facts'))
  on conflict(user_id, source_id) do update set person_id = excluded.person_id, title = excluded.title, source_name = excluded.source_name, doc_date = excluded.doc_date, hospital = excluded.hospital, doctor = excluded.doctor, fact_count = excluded.fact_count
  returning id into report_id;
  delete from public.facts where doc_id = report_id and user_id = owner_id;
  for reading in select value from jsonb_array_elements(report->'facts') loop
    if coalesce(length(trim(reading->>'analyte')), 0) = 0 or jsonb_typeof(reading->'value') is distinct from 'number' or coalesce(reading->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid measurement'; end if;
    if (reading->>'refLow')::double precision > (reading->>'refHigh')::double precision then raise exception 'Reversed reference range'; end if;
    insert into public.facts(user_id, doc_id, measured_on, analyte, analyte_printed, value, unit, ref_low, ref_high, ref_low_inclusive, ref_high_inclusive, doctor, hospital)
    values(owner_id, report_id, (reading->>'date')::date, trim(reading->>'analyte'), coalesce(reading->>'analyteAsPrinted', ''), (reading->>'value')::double precision, coalesce(reading->>'unit', ''), (reading->>'refLow')::double precision, (reading->>'refHigh')::double precision, coalesce((reading->>'refLowInclusive')::boolean, true), coalesce((reading->>'refHighInclusive')::boolean, true), coalesce(reading->>'doctor', ''), coalesce(reading->>'hospital', ''));
  end loop;
  return report_id;
end $$;
