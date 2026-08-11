create extension if not exists pg_trgm with schema extensions;

create table if not exists public.logistics_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  country text not null check (length(trim(country)) > 0),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  city text,
  location_type text not null check (location_type in (
    'airport', 'seaport', 'border_post', 'warehouse', 'distribution_centre',
    'customs_facility', 'rail_terminal', 'inland_container_depot',
    'cargo_terminal', 'delivery_depot', 'other'
  )),
  code text,
  secondary_code text,
  address text,
  status text not null default 'Active' check (status in ('Active', 'Archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists logistics_locations_identity_idx
  on public.logistics_locations (lower(country_code), lower(name));
create index if not exists logistics_locations_filters_idx
  on public.logistics_locations (status, country, location_type);
create index if not exists logistics_locations_name_search_idx
  on public.logistics_locations using gin (lower(name) extensions.gin_trgm_ops);
create index if not exists logistics_locations_city_search_idx
  on public.logistics_locations using gin (lower(coalesce(city, '')) extensions.gin_trgm_ops);
create index if not exists logistics_locations_code_search_idx
  on public.logistics_locations using gin (lower(coalesce(code, '')) extensions.gin_trgm_ops);

alter table public.route_stops
  add column if not exists logistics_location_id uuid references public.logistics_locations(id) on delete set null;
create index if not exists route_stops_logistics_location_idx on public.route_stops(logistics_location_id);

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
grant execute on function public.list_logistics_location_countries() to authenticated;

alter table public.logistics_locations enable row level security;
drop policy if exists "Authenticated admins can read logistics locations" on public.logistics_locations;
create policy "Authenticated admins can read logistics locations" on public.logistics_locations for select to authenticated using (true);
drop policy if exists "Authenticated admins can create logistics locations" on public.logistics_locations;
create policy "Authenticated admins can create logistics locations" on public.logistics_locations for insert to authenticated with check (true);
drop policy if exists "Authenticated admins can update logistics locations" on public.logistics_locations;
create policy "Authenticated admins can update logistics locations" on public.logistics_locations for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated admins can delete logistics locations" on public.logistics_locations;
create policy "Authenticated admins can delete logistics locations" on public.logistics_locations for delete to authenticated using (true);

with starter(name, country, country_code, city, location_type, code) as (values
  ('Hosea Kutako International Airport','Namibia','NA','Windhoek','airport','WDH'),
  ('Port of Walvis Bay','Namibia','NA','Walvis Bay','seaport','NAWVB'),
  ('Ariamsvlei Border Post','Namibia','NA','Ariamsvlei','border_post',null),
  ('Oshikango Border Post','Namibia','NA','Oshikango','border_post',null),
  ('OR Tambo International Airport','South Africa','ZA','Johannesburg','airport','JNB'),
  ('Cape Town International Airport','South Africa','ZA','Cape Town','airport','CPT'),
  ('Port of Durban','South Africa','ZA','Durban','seaport','ZADUR'),
  ('Port of Cape Town','South Africa','ZA','Cape Town','seaport','ZACPT'),
  ('Nakop Border Post','South Africa','ZA','Nakop','border_post',null),
  ('Quatro de Fevereiro International Airport','Angola','AO','Luanda','airport','LAD'),
  ('Port of Luanda','Angola','AO','Luanda','seaport','AOLAD'),
  ('Santa Clara Border Post','Angola','AO','Santa Clara','border_post',null),
  ('Kenneth Kaunda International Airport','Zambia','ZM','Lusaka','airport','LUN'),
  ('Chirundu Border Post','Zambia','ZM','Chirundu','border_post',null),
  ('Kazungula Border Post','Zambia','ZM','Kazungula','border_post',null),
  ('Sir Seretse Khama International Airport','Botswana','BW','Gaborone','airport','GBE'),
  ('Kazungula Border Post','Botswana','BW','Kazungula','border_post',null),
  ('Robert Gabriel Mugabe International Airport','Zimbabwe','ZW','Harare','airport','HRE'),
  ('Beitbridge Border Post','Zimbabwe','ZW','Beitbridge','border_post',null),
  ('Maputo International Airport','Mozambique','MZ','Maputo','airport','MPM'),
  ('Port of Maputo','Mozambique','MZ','Maputo','seaport','MZMPM'),
  ('Port of Beira','Mozambique','MZ','Beira','seaport','MZBEW'),
  ('Murtala Muhammed International Airport','Nigeria','NG','Lagos','airport','LOS'),
  ('Apapa Port','Nigeria','NG','Lagos','seaport','NGAPP'),
  ('Tin Can Island Port','Nigeria','NG','Lagos','seaport',null),
  ('Kotoka International Airport','Ghana','GH','Accra','airport','ACC'),
  ('Port of Tema','Ghana','GH','Tema','seaport','GHTEM'),
  ('Port of Takoradi','Ghana','GH','Takoradi','seaport','GHTKD'),
  ('Jomo Kenyatta International Airport','Kenya','KE','Nairobi','airport','NBO'),
  ('Port of Mombasa','Kenya','KE','Mombasa','seaport','KEMBA'),
  ('Namanga Border Post','Kenya','KE','Namanga','border_post',null),
  ('Entebbe International Airport','Uganda','UG','Entebbe','airport','EBB'),
  ('Malaba Border Post','Uganda','UG','Malaba','border_post',null),
  ('Julius Nyerere International Airport','Tanzania','TZ','Dar es Salaam','airport','DAR'),
  ('Port of Dar es Salaam','Tanzania','TZ','Dar es Salaam','seaport','TZDAR'),
  ('Tunduma Border Post','Tanzania','TZ','Tunduma','border_post',null),
  ('N''djili International Airport','DRC','CD','Kinshasa','airport','FIH'),
  ('Port of Matadi','DRC','CD','Matadi','seaport','CDMAT'),
  ('Kasumbalesa Border Post','DRC','CD','Kasumbalesa','border_post',null),
  ('Dubai International Airport','United Arab Emirates','AE','Dubai','airport','DXB'),
  ('Zayed International Airport','United Arab Emirates','AE','Abu Dhabi','airport','AUH'),
  ('Jebel Ali Port','United Arab Emirates','AE','Dubai','seaport','AEJEA'),
  ('Guangzhou Baiyun International Airport','China','CN','Guangzhou','airport','CAN'),
  ('Shenzhen Bao''an International Airport','China','CN','Shenzhen','airport','SZX'),
  ('Port of Shanghai','China','CN','Shanghai','seaport','CNSHA'),
  ('Port of Shenzhen','China','CN','Shenzhen','seaport','CNSZX'),
  ('Port of Ningbo-Zhoushan','China','CN','Ningbo','seaport','CNNGB')
)
insert into public.logistics_locations(name,country,country_code,city,location_type,code)
select * from starter
on conflict do nothing;
