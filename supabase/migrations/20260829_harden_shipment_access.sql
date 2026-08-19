-- Harden shipment access without changing existing shipment data.
-- Public tracking is served by the server-side service-role API and does not
-- require anonymous table or RPC access.

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.lower(
    pg_catalog.coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
  ) = 'admin';
$function$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

alter table public.shipments enable row level security;

drop policy if exists "public can view shipments" on public.shipments;
drop policy if exists "Public can view shipments" on public.shipments;
drop policy if exists "Customer shipment isolation" on public.shipments;
drop policy if exists "Administrators can read shipments" on public.shipments;
drop policy if exists "Administrators can create shipments" on public.shipments;
drop policy if exists "Administrators can update shipments" on public.shipments;
drop policy if exists "Administrators can delete shipments" on public.shipments;
drop policy if exists "Customers can read assigned shipments" on public.shipments;

create policy "Administrators can read shipments"
  on public.shipments for select to authenticated
  using ((select public.is_admin()));

create policy "Administrators can create shipments"
  on public.shipments for insert to authenticated
  with check ((select public.is_admin()));

create policy "Administrators can update shipments"
  on public.shipments for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Administrators can delete shipments"
  on public.shipments for delete to authenticated
  using ((select public.is_admin()));

create policy "Customers can read assigned shipments"
  on public.shipments for select to authenticated
  using (
    (select public.is_customer())
    and public.customer_owns_shipment(id)
  );

revoke all on table public.shipments from anon;
grant select, insert, update, delete on table public.shipments to authenticated;

alter table public.shipment_history enable row level security;

-- Remove any legacy shipment-history policy that authorizes through the
-- user-editable user_metadata JWT claim, regardless of its deployed name.
do $block$
declare
  policy_record record;
begin
  for policy_record in
    select policy.polname
    from pg_catalog.pg_policy as policy
    inner join pg_catalog.pg_class as relation on relation.oid = policy.polrelid
    inner join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'shipment_history'
      and (
        pg_catalog.coalesce(pg_catalog.pg_get_expr(policy.polqual, policy.polrelid), '') ilike '%user_metadata%'
        or pg_catalog.coalesce(pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid), '') ilike '%user_metadata%'
      )
  loop
    execute pg_catalog.format(
      'drop policy if exists %I on public.shipment_history',
      policy_record.polname
    );
  end loop;
end;
$block$;

drop policy if exists "Customer history isolation" on public.shipment_history;
drop policy if exists "Administrators can read shipment history" on public.shipment_history;
drop policy if exists "Administrators can create shipment history" on public.shipment_history;
drop policy if exists "Authenticated administrators can create shipment history" on public.shipment_history;
drop policy if exists "Customers can read assigned shipment history" on public.shipment_history;

create policy "Administrators can read shipment history"
  on public.shipment_history for select to authenticated
  using ((select public.is_admin()));

create policy "Administrators can create shipment history"
  on public.shipment_history for insert to authenticated
  with check ((select public.is_admin()));

create policy "Customers can read assigned shipment history"
  on public.shipment_history for select to authenticated
  using (
    (select public.is_customer())
    and public.customer_owns_shipment(shipment_id)
  );

revoke all on table public.shipment_history from anon;
grant select, insert on table public.shipment_history to authenticated;

-- This RPC is still used by the authenticated customer portal. Restrict it
-- to documents belonging to a shipment assigned to the calling customer.
create or replace function public.get_public_shipment_documents(target_tracking_number text)
returns table (
  id bigint,
  shipment_id bigint,
  document_name text,
  document_type text,
  document_direction text,
  file_url text,
  file_size bigint,
  visible_to_customer boolean,
  uploaded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    document.id,
    document.shipment_id,
    document.document_name,
    document.document_type,
    document.document_direction,
    document.file_url,
    document.file_size,
    document.visible_to_customer,
    document.uploaded_at
  from public.shipment_documents as document
  inner join public.shipments as shipment on shipment.id = document.shipment_id
  where target_tracking_number is not null
    and pg_catalog.length(pg_catalog.btrim(target_tracking_number)) between 1 and 128
    and shipment.tracking_number = pg_catalog.btrim(target_tracking_number)
    and document.visible_to_customer = true
    and public.customer_owns_shipment(shipment.id)
  order by document.uploaded_at desc, document.id desc;
$function$;

revoke all on function public.get_public_shipment_documents(text) from public;
revoke all on function public.get_public_shipment_documents(text) from anon;
grant execute on function public.get_public_shipment_documents(text) to authenticated;

-- Public tracking now reads history through the server-side service-role API.
-- No browser role needs to execute the legacy SECURITY DEFINER history RPC.
revoke all on function public.get_public_shipment_history(text) from public;
revoke all on function public.get_public_shipment_history(text) from anon;
revoke all on function public.get_public_shipment_history(text) from authenticated;

-- Pin every deployed overload of the legacy tracking-number functions to an
-- explicit, non-caller-controlled search path without changing their bodies.
do $block$
declare
  function_record record;
begin
  for function_record in
    select procedure.oid::pg_catalog.regprocedure as function_signature
    from pg_catalog.pg_proc as procedure
    inner join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('generate_tracking_number', 'set_tracking_number')
  loop
    execute pg_catalog.format(
      'alter function %s set search_path = pg_catalog, public',
      function_record.function_signature
    );
  end loop;
end;
$block$;
