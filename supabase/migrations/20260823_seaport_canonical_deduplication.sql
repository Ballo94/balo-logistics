-- Conservative seaport-only canonical matching. This migration does not run
-- cleanup automatically; administrators must inspect the dry-run report and
-- pass explicit duplicate IDs to apply_seaport_duplicate_cleanup().

create or replace function public.normalize_logistics_text(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select trim(regexp_replace(regexp_replace(lower(value), '[^[:alnum:]]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;

create or replace function public.normalize_seaport_name(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select trim(regexp_replace(
    regexp_replace(public.normalize_logistics_text(value), '^(port of|port)\s+', ''),
    '\s+port$', ''
  ));
$$;

create or replace function public.find_matching_logistics_location(item jsonb)
returns public.logistics_locations
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  matched public.logistics_locations%rowtype;
begin
  if nullif(trim(item->>'code'), '') is not null then
    select * into matched
    from public.logistics_locations l
    where l.location_type = item->>'location_type'
      and l.country_code = upper(item->>'country_code')
      and lower(l.code) = lower(item->>'code')
    limit 1;
  end if;

  if matched.id is null and item->>'location_type' = 'seaport'
    and nullif(trim(item->>'name'), '') is not null
    and nullif(trim(item->>'city'), '') is not null then
    select * into matched
    from public.logistics_locations l
    where l.location_type = 'seaport'
      and l.country_code = upper(item->>'country_code')
      and public.normalize_seaport_name(l.name) = public.normalize_seaport_name(item->>'name')
      and public.normalize_logistics_text(coalesce(l.city, '')) = public.normalize_logistics_text(item->>'city')
    order by
      l.admin_managed desc,
      (nullif(trim(l.code), '') is not null) desc,
      l.verified desc,
      (l.latitude is not null and l.longitude is not null) desc,
      l.created_at asc
    limit 1;
  end if;

  if matched.id is null and nullif(trim(item->>'code'), '') is null then
    select * into matched
    from public.logistics_locations l
    where l.location_type = item->>'location_type'
      and l.country_code = upper(item->>'country_code')
      and lower(l.name) = lower(item->>'name')
      and lower(coalesce(l.city, '')) = lower(coalesce(item->>'city', ''))
    limit 1;
  end if;

  return matched;
end;
$$;

create or replace function public.preview_logistics_location_import(records jsonb)
returns table(input_index integer, result text, location_id uuid, message text)
language plpgsql stable security invoker
set search_path = public
as $$
declare
  item jsonb;
  item_index integer;
  existing public.logistics_locations%rowtype;
begin
  if jsonb_typeof(records) <> 'array' then raise exception 'records must be a JSON array'; end if;
  for item, item_index in select value, ordinality::integer from jsonb_array_elements(records) with ordinality loop
    existing := public.find_matching_logistics_location(item);
    input_index := item_index - 1;
    if existing.id is null then
      result := 'new'; location_id := null; message := 'Ready to import.';
    else
      result := 'duplicate'; location_id := existing.id;
      message := case when existing.admin_managed then 'Existing admin-managed location preserved.' else 'Existing imported location preserved.' end;
    end if;
    return next;
  end loop;
end;
$$;

create or replace function public.import_logistics_locations(records jsonb)
returns table(input_index integer, result text, location_id uuid, message text)
language plpgsql security invoker
set search_path = public
as $$
declare
  item jsonb;
  item_index integer;
  existing public.logistics_locations%rowtype;
  inserted_id uuid;
begin
  if jsonb_typeof(records) <> 'array' then raise exception 'records must be a JSON array'; end if;
  for item, item_index in select value, ordinality::integer from jsonb_array_elements(records) with ordinality loop
    existing := public.find_matching_logistics_location(item);
    if existing.id is not null then
      input_index := item_index - 1; result := 'duplicate'; location_id := existing.id;
      message := case when existing.admin_managed then 'Existing admin-managed location preserved.' else 'Existing imported location preserved.' end;
      return next; continue;
    end if;
    begin
      insert into public.logistics_locations (
        name, country, country_code, country_secondary, country_secondary_code, city,
        location_type, code, secondary_code, latitude, longitude, address, status,
        notes, source, source_reference, verified, admin_managed
      ) values (
        trim(item->>'name'), trim(item->>'country'), upper(trim(item->>'country_code')),
        nullif(trim(item->>'country_secondary'), ''), nullif(upper(trim(item->>'country_secondary_code')), ''),
        nullif(trim(item->>'city'), ''), item->>'location_type', nullif(upper(trim(item->>'code')), ''),
        nullif(upper(trim(item->>'secondary_code')), ''), (item->>'latitude')::numeric,
        (item->>'longitude')::numeric, nullif(trim(item->>'address'), ''), 'Active',
        nullif(trim(item->>'notes'), ''), coalesce(nullif(trim(item->>'source'), ''), 'import'),
        nullif(trim(item->>'source_reference'), ''), coalesce((item->>'verified')::boolean, false), false
      ) returning id into inserted_id;
      input_index := item_index - 1; result := 'inserted'; location_id := inserted_id; message := 'Location imported.'; return next;
    exception when unique_violation then
      input_index := item_index - 1; result := 'duplicate'; location_id := null; message := 'Duplicate detected by database constraint.'; return next;
    when others then
      input_index := item_index - 1; result := 'invalid'; location_id := null; message := sqlerrm; return next;
    end;
  end loop;
end;
$$;

create or replace function public.preview_seaport_duplicate_cleanup()
returns table(
  canonical_id uuid, canonical_name text, canonical_code text, duplicate_id uuid,
  duplicate_name text, duplicate_code text, country text, city text,
  route_stop_references bigint, snapshot_stop_references bigint,
  recommendation text, reason text
)
language sql
stable
security invoker
set search_path = public
as $$
  with ranked as (
    select l.*,
      public.normalize_seaport_name(l.name) as port_key,
      public.normalize_logistics_text(coalesce(l.city, '')) as city_key,
      row_number() over (
        partition by l.country_code, public.normalize_seaport_name(l.name), public.normalize_logistics_text(coalesce(l.city, ''))
        order by l.admin_managed desc, (nullif(trim(l.code), '') is not null) desc,
          l.verified desc, (l.latitude is not null and l.longitude is not null) desc, l.created_at asc
      ) as rank
    from public.logistics_locations l
    where l.location_type = 'seaport' and nullif(trim(l.city), '') is not null
  ), pairs as (
    select canonical.id canonical_id, canonical.name canonical_name, canonical.code canonical_code,
      canonical.admin_managed canonical_admin, duplicate.id duplicate_id,
      duplicate.name duplicate_name, duplicate.code duplicate_code,
      duplicate.admin_managed duplicate_admin, canonical.country, canonical.city
    from ranked duplicate
    join ranked canonical on canonical.country_code = duplicate.country_code
      and canonical.port_key = duplicate.port_key and canonical.city_key = duplicate.city_key and canonical.rank = 1
    where duplicate.rank > 1
  )
  select p.canonical_id, p.canonical_name, p.canonical_code, p.duplicate_id,
    p.duplicate_name, p.duplicate_code, p.country, p.city,
    (select count(*) from public.route_stops r where r.logistics_location_id = p.duplicate_id),
    (select count(*) from public.shipment_route_stops s where s.logistics_location_id = p.duplicate_id),
    case when p.duplicate_admin then 'review' else 'merge' end,
    case when p.duplicate_admin then 'Multiple administrator-managed records require manual review.'
      else 'Same country, normalized port name, and normalized city; canonical chosen by provenance and data quality.' end
  from pairs p
  order by p.country, p.city, p.canonical_name, p.duplicate_name;
$$;

create or replace function public.apply_seaport_duplicate_cleanup(duplicate_ids uuid[])
returns table(duplicate_id uuid, canonical_id uuid, result text)
language plpgsql
security invoker
set search_path = public
as $$
declare
  duplicate public.logistics_locations%rowtype;
  canonical public.logistics_locations%rowtype;
begin
  if duplicate_ids is null or cardinality(duplicate_ids) = 0 then raise exception 'Explicit duplicate IDs from the preview report are required.'; end if;
  for duplicate in select * from public.logistics_locations where id = any(duplicate_ids) for update loop
    if duplicate.location_type <> 'seaport' then raise exception 'Location % is not a seaport.', duplicate.id; end if;
    if duplicate.admin_managed then raise exception 'Administrator-managed location % cannot be merged automatically.', duplicate.id; end if;

    select * into canonical from public.logistics_locations l
    where l.id <> duplicate.id and l.location_type = 'seaport'
      and l.country_code = duplicate.country_code
      and public.normalize_seaport_name(l.name) = public.normalize_seaport_name(duplicate.name)
      and public.normalize_logistics_text(coalesce(l.city, '')) = public.normalize_logistics_text(coalesce(duplicate.city, ''))
    order by l.admin_managed desc, (nullif(trim(l.code), '') is not null) desc,
      l.verified desc, (l.latitude is not null and l.longitude is not null) desc, l.created_at asc
    limit 1 for update;
    if canonical.id is null then raise exception 'No current conservative canonical match for %.', duplicate.id; end if;

    update public.logistics_locations set
      latitude = coalesce(latitude, duplicate.latitude), longitude = coalesce(longitude, duplicate.longitude),
      secondary_code = coalesce(secondary_code, duplicate.secondary_code), address = coalesce(address, duplicate.address),
      notes = coalesce(notes, duplicate.notes), updated_at = now()
    where id = canonical.id;
    update public.route_stops set logistics_location_id = canonical.id where logistics_location_id = duplicate.id;
    update public.shipment_route_stops set logistics_location_id = canonical.id where logistics_location_id = duplicate.id;
    delete from public.logistics_locations where id = duplicate.id;
    duplicate_id := duplicate.id; canonical_id := canonical.id; result := 'merged'; return next;
  end loop;
end;
$$;

revoke all on function public.normalize_logistics_text(text) from public, anon;
revoke all on function public.normalize_seaport_name(text) from public, anon;
revoke all on function public.find_matching_logistics_location(jsonb) from public, anon;
revoke all on function public.import_logistics_locations(jsonb) from public, anon;
revoke all on function public.preview_logistics_location_import(jsonb) from public, anon;
revoke all on function public.preview_seaport_duplicate_cleanup() from public, anon;
revoke all on function public.apply_seaport_duplicate_cleanup(uuid[]) from public, anon;
grant execute on function public.normalize_logistics_text(text) to authenticated;
grant execute on function public.normalize_seaport_name(text) to authenticated;
grant execute on function public.find_matching_logistics_location(jsonb) to authenticated;
grant execute on function public.import_logistics_locations(jsonb) to authenticated;
grant execute on function public.preview_logistics_location_import(jsonb) to authenticated;
grant execute on function public.preview_seaport_duplicate_cleanup() to authenticated;
grant execute on function public.apply_seaport_duplicate_cleanup(uuid[]) to authenticated;
