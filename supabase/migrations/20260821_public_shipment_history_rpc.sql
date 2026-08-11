-- Public tracking history is exposed only through a tracking-number lookup.
-- Direct anonymous SELECT access to shipment_history remains unchanged and blocked.
create or replace function public.get_public_shipment_history(
  p_tracking_number text
)
returns table (
  status text,
  location text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  with matched_shipment as (
    select pg_catalog.min(s.id) as shipment_id
    from public.shipments as s
    where p_tracking_number is not null
      and pg_catalog.length(pg_catalog.btrim(p_tracking_number)) between 1 and 128
      and s.tracking_number = pg_catalog.btrim(p_tracking_number)
    having pg_catalog.count(*) = 1
  )
  select
    h.status::text,
    h.location::text,
    h.created_at::timestamptz
  from public.shipment_history as h
  inner join matched_shipment as matched
    on matched.shipment_id = h.shipment_id
  order by h.created_at asc;
$function$;

revoke all
  on function public.get_public_shipment_history(text)
  from public;

grant execute
  on function public.get_public_shipment_history(text)
  to anon, authenticated;
