-- Restrict shipment event access to verified administrators and customers
-- assigned to the event's shipment. Public tracking continues through the
-- server-side service-role API.

begin;

do $block$
begin
  if pg_catalog.to_regclass('public.shipment_events') is null then
    raise exception 'Required table public.shipment_events is missing; apply 20260814_shipment_events.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception 'Required function public.is_admin() is missing; apply 20260903_harden_document_communication_access.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.is_customer()') is null then
    raise exception 'Required function public.is_customer() is missing; apply 20260818_customer_portal.sql first.';
  end if;

  if pg_catalog.to_regprocedure('public.customer_owns_shipment(bigint)') is null then
    raise exception 'Required function public.customer_owns_shipment(bigint) is missing; apply 20260818_customer_portal.sql first.';
  end if;
end;
$block$;

alter table public.shipment_events enable row level security;

drop policy if exists "Public can read shipment events" on public.shipment_events;
drop policy if exists "Authenticated admins can read shipment events" on public.shipment_events;
drop policy if exists "Authenticated admins can create shipment events" on public.shipment_events;
drop policy if exists "Authenticated admins can update shipment events" on public.shipment_events;
drop policy if exists "Authenticated admins can delete shipment events" on public.shipment_events;
drop policy if exists "Customer event isolation" on public.shipment_events;
drop policy if exists "Administrators can read shipment events" on public.shipment_events;
drop policy if exists "Administrators can create shipment events" on public.shipment_events;
drop policy if exists "Administrators can update shipment events" on public.shipment_events;
drop policy if exists "Administrators can delete shipment events" on public.shipment_events;
drop policy if exists "Customers can read assigned shipment events" on public.shipment_events;

create policy "Administrators can read shipment events"
  on public.shipment_events for select to authenticated
  using ((select public.is_admin()));

create policy "Administrators can create shipment events"
  on public.shipment_events for insert to authenticated
  with check ((select public.is_admin()));

create policy "Administrators can update shipment events"
  on public.shipment_events for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Administrators can delete shipment events"
  on public.shipment_events for delete to authenticated
  using ((select public.is_admin()));

create policy "Customers can read assigned shipment events"
  on public.shipment_events for select to authenticated
  using (
    (select public.is_customer())
    and public.customer_owns_shipment(shipment_id)
  );

revoke all on table public.shipment_events from anon;
grant select, insert, update, delete on table public.shipment_events to authenticated;
grant usage, select on sequence public.shipment_events_id_seq to authenticated;

commit;
