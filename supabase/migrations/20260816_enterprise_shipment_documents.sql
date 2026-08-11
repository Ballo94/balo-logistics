alter table public.shipment_documents
  add column if not exists visible_to_customer boolean not null default true,
  add column if not exists notes text;

update storage.buckets
set public = false, file_size_limit = 26214400
where id = 'shipment-documents';

drop policy if exists "Public can read shipment documents" on public.shipment_documents;
drop policy if exists "Customers can read visible shipment documents" on public.shipment_documents;
drop policy if exists "Authenticated admins can read shipment documents" on public.shipment_documents;

create policy "Authenticated admins can read shipment documents"
  on public.shipment_documents for select to authenticated
  using (true);

revoke all on public.shipment_documents from anon;
grant select, insert, update, delete on public.shipment_documents to authenticated;

create or replace function public.get_public_shipment_documents(target_tracking_number text)
returns table (
  id bigint,
  shipment_id bigint,
  document_name text,
  document_type text,
  file_url text,
  file_size bigint,
  visible_to_customer boolean,
  uploaded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.shipment_id, d.document_name, d.document_type, d.file_url,
    d.file_size, d.visible_to_customer, d.uploaded_at
  from public.shipment_documents d
  join public.shipments s on s.id = d.shipment_id
  where s.tracking_number = trim(target_tracking_number)
    and d.visible_to_customer = true
  order by d.uploaded_at desc, d.id desc;
$$;

revoke all on function public.get_public_shipment_documents(text) from public;
grant execute on function public.get_public_shipment_documents(text) to anon, authenticated;

drop policy if exists "Public can read shipment document files" on storage.objects;
drop policy if exists "Customers can read visible shipment document files" on storage.objects;
create policy "Customers can read visible shipment document files"
  on storage.objects for select to anon, authenticated
  using (
    bucket_id = 'shipment-documents'
    and (
      auth.role() = 'authenticated'
      or exists (
        select 1
        from public.shipment_documents d
        where d.visible_to_customer = true
          and (
            d.file_url = storage.objects.name
            or d.file_url like '%/shipment-documents/' || storage.objects.name
          )
      )
    )
  );
