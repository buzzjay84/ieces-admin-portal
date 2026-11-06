-- Run after the BSP registration, fee, receipt, and school-year migrations.
-- One shared school workspace; only BSP administrators can read its private records.
begin;
create table if not exists public.bsp_workspace (
  id boolean primary key default true check (id),
  revision bigint not null check (revision > 0),
  document jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.bsp_workspace enable row level security;
revoke all on public.bsp_workspace from public, anon, authenticated;
grant select on public.bsp_workspace to authenticated;
drop policy if exists "BSP admins read workspace" on public.bsp_workspace;
create policy "BSP admins read workspace" on public.bsp_workspace for select to authenticated using (public.is_bsp_admin());

-- Preserve the existing desktop format, including units, adults, camping, counters and archives.
create or replace function public.bsp_workspace_people(p_document jsonb)
returns table (person jsonb, unit jsonb, school_year text)
language sql immutable set search_path = '' as $$
  with years as (
    select p_document as data, p_document->'settings'->>'schoolYear' as sy
    union all
    select a.value, a.key from pg_catalog.jsonb_each(coalesce(p_document->'archives', '{}'::jsonb)) a
  )
  select s.value, u.value, y.sy from years y
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(y.data->'units', '[]'::jsonb)) u
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(u.value->'scouts', '[]'::jsonb)) s
  union all
  select a.value, null::jsonb, y.sy from years y
    cross join lateral pg_catalog.jsonb_array_elements(coalesce(y.data->'adults', '[]'::jsonb)) a;
$$;
revoke all on function public.bsp_workspace_people(jsonb) from public, anon, authenticated;

create or replace function public.bsp_save_workspace(p_expected_revision bigint, p_document jsonb)
returns setof public.bsp_workspace
language plpgsql security definer set search_path = '' as $$
declare previous public.bsp_workspace; rec record; settings jsonb; doc jsonb := p_document;
begin
  if not public.is_bsp_admin() then raise exception 'BSP administrator access is required' using errcode = '42501'; end if;
  if jsonb_typeof(doc) is distinct from 'object'
    or jsonb_typeof(doc->'units') is distinct from 'array'
    or jsonb_typeof(doc->'adults') is distinct from 'array'
    or jsonb_typeof(doc->'settings') is distinct from 'object'
    or (doc ? 'archives' and jsonb_typeof(doc->'archives') <> 'object')
    or octet_length(doc::text) > 5242880 then raise exception 'Invalid BSP workspace or workspace exceeds 5 MB'; end if;
  settings := doc->'settings';
  if coalesce(settings->>'nextReceipt', '') !~ '^[0-9]+$'
    or (settings->>'nextReceipt')::numeric < 1 then raise exception 'Invalid next receipt number'; end if;

  select * into previous from public.bsp_workspace where id = true for update;
  if found then
    if previous.revision <> p_expected_revision then
      raise exception 'Another app saved newer BSP records. Load the latest records and retry.' using errcode = '40001';
    end if;
  elsif p_expected_revision <> 0 then
    raise exception 'BSP workspace is missing. Reconnect before saving.' using errcode = '40001';
  else
    insert into public.bsp_workspace (id, revision, document) values (true, 1, doc) on conflict (id) do nothing;
    if not found then raise exception 'Another app initialized the workspace. Load its records.' using errcode = '40001'; end if;
  end if;

  -- Reject removed linked registrations so the public website also drops deleted records.
  if previous.id is not null then
    update public.bsp_registrations r set status = 'rejected', imported_at = null,
      ar_no = null, receipt_printed_at = null, camp_ar_no = null, camp_receipt_printed_at = null, camp_requested = false
    where r.id in (select (p.person->>'onlineId')::uuid from public.bsp_workspace_people(previous.document) p where nullif(p.person->>'onlineId', '') is not null)
      and r.id not in (select (p.person->>'onlineId')::uuid from public.bsp_workspace_people(doc) p where nullif(p.person->>'onlineId', '') is not null);
  end if;

  for rec in select * from public.bsp_workspace_people(doc) loop
    if jsonb_typeof(rec.person) <> 'object' or nullif(rec.person->>'id', '') is null then raise exception 'Invalid BSP person'; end if;
    if coalesce(nullif(rec.person->'payment'->>'amountPaid', ''), '0')::numeric < 0
      or coalesce(nullif(rec.person->'camp'->>'amountPaid', ''), '0')::numeric < 0 then raise exception 'Payment amounts must not be negative'; end if;
    if nullif(rec.person->>'onlineId', '') is null then continue; end if;
    -- Avoid emitting website change notifications for every unchanged learner on each save.
    if previous.id is not null and exists (
      select 1 from public.bsp_workspace_people(previous.document) old
      where old.person = rec.person
        and (old.unit - 'scouts') is not distinct from (rec.unit - 'scouts')
        and old.school_year is not distinct from rec.school_year
    ) then continue; end if;
    update public.bsp_registrations r set
      surname = rec.person->>'surname',
      given_name = coalesce(rec.person->>'given', rec.person->>'first'),
      middle_initial = nullif(rec.person->>'mi', ''), sex = nullif(rec.person->>'sex', ''),
      birthdate = nullif(rec.person->>'birthdate', '')::date, contact_no = nullif(rec.person->>'contact', ''),
      sponsor = coalesce(rec.unit->>'sponsor', rec.person->>'sponsor', r.sponsor),
      unit_no = coalesce(rec.unit->>'unitNo', rec.person->>'unitNo', r.unit_no),
      unit_type = coalesce(nullif(rec.unit->>'unitType', ''), r.unit_type),
      grade_section = case when r.reg_type = 'scout' then nullif(rec.person->>'grade', '') else r.grade_section end,
      guardian_name = case when r.reg_type = 'scout' then nullif(rec.person->>'guardian', '') else r.guardian_name end,
      reg_status = case when r.reg_type = 'scout' then coalesce(nullif(rec.person->>'status', ''), 'N') else r.reg_status end,
      role = case when r.reg_type = 'adult' then rec.person->>'role' else r.role end,
      card_no = nullif(rec.person->>'cardNo', ''),
      highest_rank = case when r.reg_type = 'scout' then nullif(rec.person->>'rank', '') else r.highest_rank end,
      years_in_scouting = case when r.reg_type = 'scout' then nullif(rec.person->>'years', '')::int else r.years_in_scouting end,
      civil_status = case when r.reg_type = 'adult' then nullif(rec.person->>'civil', '') else r.civil_status end,
      tenure = case when r.reg_type = 'adult' then nullif(rec.person->>'tenure', '') else r.tenure end,
      card_expiration = case when r.reg_type = 'adult' then nullif(rec.person->>'expiration', '')::date else r.card_expiration end,
      birthplace = case when r.reg_type = 'adult' then nullif(rec.person->>'birthplace', '') else r.birthplace end,
      religion = case when r.reg_type = 'adult' then nullif(rec.person->>'religion', '') else r.religion end,
      occupation = case when r.reg_type = 'adult' then nullif(rec.person->>'occupation', '') else r.occupation end,
      position_title = case when r.reg_type = 'adult' then nullif(rec.person->>'position', '') else r.position_title end,
      status = 'imported', imported_at = coalesce(r.imported_at, now()),
      sy = coalesce(rec.school_year, r.sy),
      ar_no = case when coalesce(nullif(rec.person->'payment'->>'amountPaid', ''), '0')::numeric > 0 then nullif(rec.person->'payment'->>'receiptNo', '') else null end,
      camp_requested = coalesce((rec.person->'camp'->>'joined')::boolean, false) or coalesce(nullif(rec.person->'camp'->>'amountPaid', ''), '0')::numeric > 0,
      camp_ar_no = case when coalesce(nullif(rec.person->'camp'->>'amountPaid', ''), '0')::numeric > 0 then nullif(rec.person->'camp'->>'receiptNo', '') else null end,
      receipt_printed_at = case when coalesce(nullif(rec.person->'payment'->>'amountPaid', ''), '0')::numeric > 0 then coalesce(r.receipt_printed_at, nullif(rec.person->'payment'->>'receiptPrintedAt', '')::timestamptz) else null end,
      camp_receipt_printed_at = case when coalesce(nullif(rec.person->'camp'->>'amountPaid', ''), '0')::numeric > 0 then coalesce(r.camp_receipt_printed_at, nullif(rec.person->'camp'->>'receiptPrintedAt', '')::timestamptz) else null end
    where r.id = (rec.person->>'onlineId')::uuid;
  end loop;

  if coalesce((settings->>'websiteFeesPending')::boolean, false) then
    perform public.bsp_publish_fees(settings->>'defaultSponsor', settings->'rates', settings->>'campName', settings->>'campDate', settings->>'campVenue', coalesce(settings->>'schoolYear', ''));
    doc := jsonb_set(doc, '{settings,websiteFeesPending}', 'false'::jsonb);
    doc := jsonb_set(doc, '{settings,websiteFeesPublishedAt}', to_jsonb(now()::text));
  end if;
  update public.bsp_workspace set document = doc, revision = coalesce(previous.revision, 0) + 1, updated_at = now() where id = true;
  return query select * from public.bsp_workspace where id = true;
end;
$$;
revoke all on function public.bsp_save_workspace(bigint, jsonb) from public, anon;
grant execute on function public.bsp_save_workspace(bigint, jsonb) to authenticated;
commit;
