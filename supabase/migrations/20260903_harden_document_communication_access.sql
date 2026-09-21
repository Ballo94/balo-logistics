-- Consolidate shipment document and communication access around the verified
-- administrator predicate and assigned-customer ownership. Public tracking
-- continues through the server-side service-role API and signed URLs.

begin;

do $block$
begin
  if pg_catalog.to_regclass('public.customer_profiles') is null then
    raise exception 'Required table public.customer_profiles is missing; apply the customer portal foundation before this hardening migration.';
  end if;

  if pg_catalog.to_regclass('public.customer_shipment_assignments') is null then
    raise exception 'Required table public.customer_shipment_assignments is missing; apply the customer portal foundation before this hardening migration.';
  end if;
end;
$block$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select pg_catalog.lower(
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''::text)
  ) = 'admin';
$function$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_customer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.customer_profiles as profile
    where profile.user_id = (select auth.uid())
  );
$function$;

create or replace function public.customer_owns_shipment(target_shipment_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.customer_shipment_assignments as assignment
    where assignment.user_id = (select auth.uid())
      and assignment.shipment_id = target_shipment_id
  );
$function$;

revoke all on function public.is_customer() from public;
revoke all on function public.is_customer() from anon;
revoke all on function public.customer_owns_shipment(bigint) from public;
revoke all on function public.customer_owns_shipment(bigint) from anon;
grant execute on function public.is_customer() to authenticated;
grant execute on function public.customer_owns_shipment(bigint) to authenticated;

alter table public.shipment_documents enable row level security;

drop policy if exists "Public can read shipment documents" on public.shipment_documents;
drop policy if exists "Customers can read visible shipment documents" on public.shipment_documents;
drop policy if exists "Authenticated admins can read shipment documents" on public.shipment_documents;
drop policy if exists "Authenticated admins can create shipment documents" on public.shipment_documents;
drop policy if exists "Authenticated admins can update shipment documents" on public.shipment_documents;
drop policy if exists "Authenticated admins can delete shipment documents" on public.shipment_documents;
drop policy if exists "Customer document isolation" on public.shipment_documents;
drop policy if exists "Administrators can read shipment documents" on public.shipment_documents;
drop policy if exists "Administrators can create shipment documents" on public.shipment_documents;
drop policy if exists "Administrators can update shipment documents" on public.shipment_documents;
drop policy if exists "Administrators can delete shipment documents" on public.shipment_documents;
drop policy if exists "Customers can read assigned visible shipment documents" on public.shipment_documents;

create policy "Administrators can read shipment documents" on public.shipment_documents
  for select to authenticated using ((select public.is_admin()));
create policy "Administrators can create shipment documents" on public.shipment_documents
  for insert to authenticated with check ((select public.is_admin()));
create policy "Administrators can update shipment documents" on public.shipment_documents
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Administrators can delete shipment documents" on public.shipment_documents
  for delete to authenticated using ((select public.is_admin()));
create policy "Customers can read assigned visible shipment documents" on public.shipment_documents
  for select to authenticated using (
    (select public.is_customer()) and visible_to_customer and public.customer_owns_shipment(shipment_id)
  );

revoke all on table public.shipment_documents from anon;
grant select, insert, update, delete on table public.shipment_documents to authenticated;
grant usage, select on sequence public.shipment_documents_id_seq to authenticated;

alter table public.shipment_communications enable row level security;

drop policy if exists "Authenticated admins can read shipment communications" on public.shipment_communications;
drop policy if exists "Authenticated admins can create shipment communications" on public.shipment_communications;
drop policy if exists "Authenticated admins can update shipment communications" on public.shipment_communications;
drop policy if exists "Authenticated admins can delete shipment communications" on public.shipment_communications;
drop policy if exists "Customer communication isolation" on public.shipment_communications;
drop policy if exists "Administrators can read shipment communications" on public.shipment_communications;
drop policy if exists "Administrators can create shipment communications" on public.shipment_communications;
drop policy if exists "Administrators can update shipment communications" on public.shipment_communications;
drop policy if exists "Administrators can delete shipment communications" on public.shipment_communications;
drop policy if exists "Customers can read assigned visible shipment communications" on public.shipment_communications;

create policy "Administrators can read shipment communications" on public.shipment_communications
  for select to authenticated using ((select public.is_admin()));
create policy "Administrators can create shipment communications" on public.shipment_communications
  for insert to authenticated with check ((select public.is_admin()));
create policy "Administrators can update shipment communications" on public.shipment_communications
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Administrators can delete shipment communications" on public.shipment_communications
  for delete to authenticated using ((select public.is_admin()));
create policy "Customers can read assigned visible shipment communications" on public.shipment_communications
  for select to authenticated using (
    (select public.is_customer()) and visible_to_customer and public.customer_owns_shipment(shipment_id)
  );

revoke all on table public.shipment_communications from anon;
grant select, insert, update, delete on table public.shipment_communications to authenticated;
grant usage, select on sequence public.shipment_communications_id_seq to authenticated;

update storage.buckets set public = false where id = 'shipment-documents';

drop policy if exists "Public can read shipment document files" on storage.objects;
drop policy if exists "Customers can read visible shipment document files" on storage.objects;
drop policy if exists "Authenticated admins can upload shipment document files" on storage.objects;
drop policy if exists "Authenticated admins can update shipment document files" on storage.objects;
drop policy if exists "Authenticated admins can delete shipment document files" on storage.objects;
drop policy if exists "Administrators can read shipment document files" on storage.objects;
drop policy if exists "Administrators can upload shipment document files" on storage.objects;
drop policy if exists "Administrators can update shipment document files" on storage.objects;
drop policy if exists "Administrators can delete shipment document files" on storage.objects;
drop policy if exists "Customers can read assigned visible shipment document files" on storage.objects;

create policy "Administrators can read shipment document files" on storage.objects
  for select to authenticated using (bucket_id = 'shipment-documents' and (select public.is_admin()));
create policy "Administrators can upload shipment document files" on storage.objects
  for insert to authenticated with check (bucket_id = 'shipment-documents' and (select public.is_admin()));
create policy "Administrators can update shipment document files" on storage.objects
  for update to authenticated using (bucket_id = 'shipment-documents' and (select public.is_admin()))
  with check (bucket_id = 'shipment-documents' and (select public.is_admin()));
create policy "Administrators can delete shipment document files" on storage.objects
  for delete to authenticated using (bucket_id = 'shipment-documents' and (select public.is_admin()));
create policy "Customers can read assigned visible shipment document files" on storage.objects
  for select to authenticated using (
    bucket_id = 'shipment-documents'
    and (select public.is_customer())
    and name in (
      select document.file_url from public.shipment_documents as document
      where document.visible_to_customer and public.customer_owns_shipment(document.shipment_id)
    )
  );

commit;
