alter table public.route_templates
  add column if not exists estimated_transit_days integer check (estimated_transit_days is null or estimated_transit_days >= 0),
  add column if not exists route_status text not null default 'Active' check (route_status in ('Active', 'Archived')),
  add column if not exists notes text,
  add column if not exists library_root_id uuid references public.route_templates(id) on delete set null,
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists is_current boolean not null default true;

update public.route_templates set library_root_id = id where library_root_id is null;

alter table public.route_stops
  drop constraint if exists route_stops_stop_type_check;

alter table public.route_stops
  add constraint route_stops_stop_type_check check (stop_type in (
    'airport', 'port', 'border', 'warehouse', 'distribution_centre', 'customs',
    'transit_hub', 'rail_terminal', 'delivery_depot', 'customer_address', 'other'
  )),
  add column if not exists expected_arrival_offset integer check (expected_arrival_offset is null or expected_arrival_offset >= 0),
  add column if not exists expected_departure_offset integer check (expected_departure_offset is null or expected_departure_offset >= 0),
  add column if not exists default_status_text text;

create index if not exists route_templates_library_status_idx
  on public.route_templates(is_current, route_status, transport_mode, name);
create index if not exists route_templates_library_root_idx
  on public.route_templates(library_root_id, version desc);
create index if not exists route_stops_search_idx
  on public.route_stops(route_template_id, country, city, name);
