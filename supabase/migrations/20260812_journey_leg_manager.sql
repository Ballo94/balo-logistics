alter table public.route_stops
  drop constraint if exists route_stops_onward_transport_check;

alter table public.route_stops
  add constraint route_stops_onward_transport_check check (
    onward_transport is null or onward_transport in (
      'Road', 'Air', 'Sea', 'Rail', 'Courier', 'Internal Transfer'
    )
  ),
  add column if not exists estimated_duration_hours numeric(10,2) check (
    estimated_duration_hours is null or estimated_duration_hours >= 0
  ),
  add column if not exists estimated_distance_km numeric(12,2) check (
    estimated_distance_km is null or estimated_distance_km >= 0
  ),
  add column if not exists leg_internal_notes text;

create index if not exists route_stops_leg_order_idx
  on public.route_stops(route_template_id, position, onward_transport);
