create table if not exists public.shipment_route_snapshots (
  shipment_id bigint primary key references public.shipments(id) on delete cascade,
  route_template_id uuid references public.route_templates(id) on delete set null,
  template_name text not null,
  transport_mode text not null,
  template_version integer not null default 1,
  captured_at timestamptz not null default now()
);

create table if not exists public.shipment_route_stops (
  id uuid primary key default gen_random_uuid(),
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  country text not null,
  city text not null,
  stop_type text not null,
  code text,
  operational_notes text,
  onward_transport text check (onward_transport is null or onward_transport in ('Road', 'Air', 'Sea', 'Rail', 'Courier', 'Internal Transfer')),
  estimated_duration_hours numeric(10,2) check (estimated_duration_hours is null or estimated_duration_hours >= 0),
  estimated_distance_km numeric(12,2) check (estimated_distance_km is null or estimated_distance_km >= 0),
  leg_internal_notes text,
  expected_arrival_offset integer check (expected_arrival_offset is null or expected_arrival_offset >= 0),
  expected_departure_offset integer check (expected_departure_offset is null or expected_departure_offset >= 0),
  default_status_text text,
  logistics_location_id uuid references public.logistics_locations(id) on delete set null,
  unique (shipment_id, position)
);

create index if not exists shipment_route_stops_order_idx on public.shipment_route_stops(shipment_id, position);
create index if not exists shipment_route_snapshots_template_idx on public.shipment_route_snapshots(route_template_id);

alter table public.shipment_route_snapshots enable row level security;
alter table public.shipment_route_stops enable row level security;

drop policy if exists "Public can read shipment route snapshots" on public.shipment_route_snapshots;
create policy "Public can read shipment route snapshots" on public.shipment_route_snapshots for select using (true);
drop policy if exists "Authenticated admins can create shipment route snapshots" on public.shipment_route_snapshots;
create policy "Authenticated admins can create shipment route snapshots" on public.shipment_route_snapshots for insert to authenticated with check (true);
drop policy if exists "Authenticated admins can delete shipment route snapshots" on public.shipment_route_snapshots;
create policy "Authenticated admins can delete shipment route snapshots" on public.shipment_route_snapshots for delete to authenticated using (true);

drop policy if exists "Public can read shipment route stops" on public.shipment_route_stops;
create policy "Public can read shipment route stops" on public.shipment_route_stops for select using (true);
drop policy if exists "Authenticated admins can create shipment route stops" on public.shipment_route_stops;
create policy "Authenticated admins can create shipment route stops" on public.shipment_route_stops for insert to authenticated with check (true);
drop policy if exists "Authenticated admins can delete shipment route stops" on public.shipment_route_stops;
create policy "Authenticated admins can delete shipment route stops" on public.shipment_route_stops for delete to authenticated using (true);

create or replace function public.snapshot_shipment_route(target_shipment_id bigint, selected_route_template_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  selected_template public.route_templates%rowtype;
begin
  select * into selected_template from public.route_templates where id = selected_route_template_id;
  if selected_template.id is null then raise exception 'Selected route template does not exist.'; end if;
  if not exists (select 1 from public.shipments where id = target_shipment_id) then raise exception 'Shipment does not exist.'; end if;

  insert into public.shipment_route_snapshots(shipment_id, route_template_id, template_name, transport_mode, template_version)
  values (target_shipment_id, selected_template.id, selected_template.name, selected_template.transport_mode, coalesce(selected_template.version, 1))
  on conflict (shipment_id) do nothing;

  insert into public.shipment_route_stops(
    shipment_id, position, name, country, city, stop_type, code, operational_notes,
    onward_transport, estimated_duration_hours, estimated_distance_km, leg_internal_notes,
    expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id
  )
  select target_shipment_id, position, name, country, city, stop_type, code, operational_notes,
    onward_transport, estimated_duration_hours, estimated_distance_km, leg_internal_notes,
    expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id
  from public.route_stops
  where route_template_id = selected_template.id
  order by position
  on conflict (shipment_id, position) do nothing;
end;
$$;

revoke all on function public.snapshot_shipment_route(bigint, uuid) from public, anon;
grant execute on function public.snapshot_shipment_route(bigint, uuid) to authenticated;
