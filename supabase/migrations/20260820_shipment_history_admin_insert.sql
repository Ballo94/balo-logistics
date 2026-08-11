-- Allow the existing authenticated single-admin workflow to create shipment
-- history entries while keeping anonymous and customer accounts read-only.
alter table public.shipment_history enable row level security;

drop policy if exists "Authenticated administrators can create shipment history" on public.shipment_history;
create policy "Authenticated administrators can create shipment history"
  on public.shipment_history
  for insert
  to authenticated
  with check (
    auth.uid() is not null
    and coalesce(auth.jwt() -> 'user_metadata' ->> 'account_type', 'admin') <> 'customer'
  );

grant insert on public.shipment_history to authenticated;
