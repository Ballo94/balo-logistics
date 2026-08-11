create extension if not exists pg_trgm with schema extensions;

create table if not exists public.logistics_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  country text not null check (length(trim(country)) > 0),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_secondary text,
  country_secondary_code text check (
    country_secondary_code is null or country_secondary_code ~ '^[A-Z]{2}$'
  ),
  city text,
  location_type text not null check (location_type in (
    'airport', 'seaport', 'border_post', 'warehouse', 'distribution_centre',
    'customs_facility', 'rail_terminal', 'inland_container_depot',
    'cargo_terminal', 'delivery_depot', 'other'
  )),
  code text,
  secondary_code text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  address text,
  status text not null default 'Active' check (status in ('Active', 'Archived')),
  notes text,
  source text not null default 'manual',
  source_reference text,
  verified boolean not null default false,
  admin_managed boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.logistics_locations
  add column if not exists country_secondary text,
  add column if not exists country_secondary_code text,
  add column if not exists latitude numeric(9,6),
  add column if not exists longitude numeric(9,6),
  add column if not exists source text not null default 'manual',
  add column if not exists source_reference text,
  add column if not exists verified boolean not null default false,
  add column if not exists admin_managed boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'logistics_locations_country_secondary_code_check' and conrelid = 'public.logistics_locations'::regclass) then
    alter table public.logistics_locations add constraint logistics_locations_country_secondary_code_check check (country_secondary_code is null or country_secondary_code ~ '^[A-Z]{2}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'logistics_locations_latitude_check' and conrelid = 'public.logistics_locations'::regclass) then
    alter table public.logistics_locations add constraint logistics_locations_latitude_check check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'logistics_locations_longitude_check' and conrelid = 'public.logistics_locations'::regclass) then
    alter table public.logistics_locations add constraint logistics_locations_longitude_check check (longitude is null or longitude between -180 and 180);
  end if;
end;
$$;

drop index if exists public.logistics_locations_identity_idx;
create unique index if not exists logistics_locations_code_identity_idx
  on public.logistics_locations(location_type, country_code, lower(code))
  where code is not null and length(trim(code)) > 0;
create unique index if not exists logistics_locations_name_identity_idx
  on public.logistics_locations(location_type, country_code, lower(name), lower(coalesce(city, '')));
create index if not exists logistics_locations_filters_idx
  on public.logistics_locations(status, country, location_type);
create index if not exists logistics_locations_country_code_idx
  on public.logistics_locations(country_code);
create index if not exists logistics_locations_type_idx
  on public.logistics_locations(location_type);
create index if not exists logistics_locations_verified_idx
  on public.logistics_locations(verified, status);
create index if not exists logistics_locations_name_search_idx
  on public.logistics_locations using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists logistics_locations_city_search_idx
  on public.logistics_locations using gin (lower(coalesce(city, '')) extensions.gin_trgm_ops);
create index if not exists logistics_locations_code_search_idx
  on public.logistics_locations using gin (lower(coalesce(code, '')) extensions.gin_trgm_ops);
create index if not exists logistics_locations_secondary_code_search_idx
  on public.logistics_locations using gin (lower(coalesce(secondary_code, '')) extensions.gin_trgm_ops);

alter table public.logistics_locations enable row level security;

drop policy if exists "Authenticated admins can read logistics locations" on public.logistics_locations;
create policy "Authenticated admins can read logistics locations"
  on public.logistics_locations for select to authenticated using (true);
drop policy if exists "Authenticated admins can create logistics locations" on public.logistics_locations;
create policy "Authenticated admins can create logistics locations"
  on public.logistics_locations for insert to authenticated with check (true);
drop policy if exists "Authenticated admins can update logistics locations" on public.logistics_locations;
create policy "Authenticated admins can update logistics locations"
  on public.logistics_locations for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated admins can delete logistics locations" on public.logistics_locations;
create policy "Authenticated admins can delete logistics locations"
  on public.logistics_locations for delete to authenticated using (true);

revoke all on table public.logistics_locations from anon;
grant select, insert, update, delete on table public.logistics_locations to authenticated;

create or replace function public.list_logistics_location_countries()
returns table(country text, country_code text)
language sql stable security invoker
set search_path = public
as $$
  select distinct l.country, l.country_code
  from public.logistics_locations l
  where l.status = 'Active'
  order by l.country;
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
  if jsonb_typeof(records) <> 'array' then
    raise exception 'records must be a JSON array';
  end if;

  for item, item_index in
    select value, ordinality::integer
    from jsonb_array_elements(records) with ordinality
  loop
    existing := null;

    if nullif(trim(item->>'code'), '') is not null then
      select * into existing
      from public.logistics_locations l
      where l.location_type = item->>'location_type'
        and l.country_code = upper(item->>'country_code')
        and lower(l.code) = lower(item->>'code')
      limit 1;
    else
      select * into existing
      from public.logistics_locations l
      where l.location_type = item->>'location_type'
        and l.country_code = upper(item->>'country_code')
        and lower(l.name) = lower(item->>'name')
        and lower(coalesce(l.city, '')) = lower(coalesce(item->>'city', ''))
      limit 1;
    end if;

    if existing.id is not null then
      input_index := item_index - 1;
      result := 'duplicate';
      location_id := existing.id;
      message := case
        when existing.admin_managed then 'Existing admin-managed location preserved.'
        else 'Existing imported location preserved.'
      end;
      return next;
      continue;
    end if;

    begin
      insert into public.logistics_locations (
        name, country, country_code, country_secondary, country_secondary_code,
        city, location_type, code, secondary_code, latitude, longitude, address,
        status, notes, source, source_reference, verified, admin_managed
      ) values (
        trim(item->>'name'),
        trim(item->>'country'),
        upper(trim(item->>'country_code')),
        nullif(trim(item->>'country_secondary'), ''),
        nullif(upper(trim(item->>'country_secondary_code')), ''),
        nullif(trim(item->>'city'), ''),
        item->>'location_type',
        nullif(upper(trim(item->>'code')), ''),
        nullif(upper(trim(item->>'secondary_code')), ''),
        (item->>'latitude')::numeric,
        (item->>'longitude')::numeric,
        nullif(trim(item->>'address'), ''),
        'Active',
        nullif(trim(item->>'notes'), ''),
        coalesce(nullif(trim(item->>'source'), ''), 'import'),
        nullif(trim(item->>'source_reference'), ''),
        coalesce((item->>'verified')::boolean, false),
        false
      )
      returning id into inserted_id;

      input_index := item_index - 1;
      result := 'inserted';
      location_id := inserted_id;
      message := 'Location imported.';
      return next;
    exception
      when unique_violation then
        input_index := item_index - 1;
        result := 'duplicate';
        location_id := null;
        message := 'Duplicate detected by database constraint.';
        return next;
      when others then
        input_index := item_index - 1;
        result := 'invalid';
        location_id := null;
        message := sqlerrm;
        return next;
    end;
  end loop;
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
  if jsonb_typeof(records) <> 'array' then
    raise exception 'records must be a JSON array';
  end if;

  for item, item_index in
    select value, ordinality::integer
    from jsonb_array_elements(records) with ordinality
  loop
    existing := null;

    if nullif(trim(item->>'code'), '') is not null then
      select * into existing
      from public.logistics_locations l
      where l.location_type = item->>'location_type'
        and l.country_code = upper(item->>'country_code')
        and lower(l.code) = lower(item->>'code')
      limit 1;
    else
      select * into existing
      from public.logistics_locations l
      where l.location_type = item->>'location_type'
        and l.country_code = upper(item->>'country_code')
        and lower(l.name) = lower(item->>'name')
        and lower(coalesce(l.city, '')) = lower(coalesce(item->>'city', ''))
      limit 1;
    end if;

    input_index := item_index - 1;
    if existing.id is null then
      result := 'new';
      location_id := null;
      message := 'Ready to import.';
    else
      result := 'duplicate';
      location_id := existing.id;
      message := case
        when existing.admin_managed then 'Admin-managed location will be preserved.'
        else 'Imported location already exists.'
      end;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.list_logistics_location_countries() from public, anon;
revoke all on function public.import_logistics_locations(jsonb) from public, anon;
revoke all on function public.preview_logistics_location_import(jsonb) from public, anon;
grant execute on function public.list_logistics_location_countries() to authenticated;
grant execute on function public.import_logistics_locations(jsonb) to authenticated;
grant execute on function public.preview_logistics_location_import(jsonb) to authenticated;
