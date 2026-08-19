-- Preserve Balo-generated journey-leg recommendations separately from the
-- existing administrator-controlled operational estimates.
alter table public.route_stops
  add column if not exists system_recommended_distance_km numeric(12,2) check (
    system_recommended_distance_km is null or system_recommended_distance_km >= 0
  ),
  add column if not exists system_recommended_duration_hours numeric(10,2) check (
    system_recommended_duration_hours is null or system_recommended_duration_hours >= 0
  ),
  add column if not exists system_recommendation_confidence text check (
    system_recommendation_confidence is null or system_recommendation_confidence in ('Low', 'Medium', 'High')
  ),
  add column if not exists system_recommendation_metadata jsonb,
  add column if not exists system_recommendation_calculated_at timestamptz;

alter table public.shipment_route_stops
  add column if not exists system_recommended_distance_km numeric(12,2) check (
    system_recommended_distance_km is null or system_recommended_distance_km >= 0
  ),
  add column if not exists system_recommended_duration_hours numeric(10,2) check (
    system_recommended_duration_hours is null or system_recommended_duration_hours >= 0
  ),
  add column if not exists system_recommendation_confidence text check (
    system_recommendation_confidence is null or system_recommendation_confidence in ('Low', 'Medium', 'High')
  ),
  add column if not exists system_recommendation_metadata jsonb,
  add column if not exists system_recommendation_calculated_at timestamptz;

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
    expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id,
    system_recommended_distance_km, system_recommended_duration_hours,
    system_recommendation_confidence, system_recommendation_metadata,
    system_recommendation_calculated_at
  )
  select target_shipment_id, position, name, country, city, stop_type, code, operational_notes,
    onward_transport, estimated_duration_hours, estimated_distance_km, leg_internal_notes,
    expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id,
    system_recommended_distance_km, system_recommended_duration_hours,
    system_recommendation_confidence, system_recommendation_metadata,
    system_recommendation_calculated_at
  from public.route_stops
  where route_template_id = selected_template.id
  order by position
  on conflict (shipment_id, position) do nothing;
end;
$$;

revoke all on function public.snapshot_shipment_route(bigint, uuid) from public, anon;
grant execute on function public.snapshot_shipment_route(bigint, uuid) to authenticated;
