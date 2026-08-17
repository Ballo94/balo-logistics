alter table public.shipment_documents
  alter column file_url drop not null,
  alter column file_size drop not null;

alter table public.shipment_documents
  drop constraint if exists shipment_documents_file_url_check,
  drop constraint if exists shipment_documents_file_size_check,
  drop constraint if exists shipment_documents_file_requirement_check;

alter table public.shipment_documents
  add constraint shipment_documents_file_requirement_check
  check (
    (document_direction = 'Document Request' and file_url is null and file_size is null)
    or
    (
      document_direction <> 'Document Request'
      and file_url is not null
      and length(trim(file_url)) > 0
      and file_size is not null
      and file_size >= 0
    )
  );

alter table public.shipment_documents
  drop constraint if exists shipment_documents_document_type_check;

alter table public.shipment_documents
  add constraint shipment_documents_document_type_check
  check (document_type in (
    'Commercial Invoice',
    'Packing List',
    'Air Waybill',
    'Bill of Lading',
    'Customs Declaration',
    'Delivery Note',
    'Insurance Certificate',
    'Import Permit',
    'Export Permit',
    'Proof of Delivery',
    'Other',
    'Cargo Received Photo',
    'Packing Photo',
    'Loading Photo',
    'Customs Inspection Photo',
    'Customs / Inspection Photo',
    'In-Transit Photo',
    'Offloading Photo',
    'Delivery / Proof Photo',
    'Delivery Photo',
    'Other Shipment Photo',
    'Other Photo'
  ));

drop function if exists public.get_public_shipment_documents(text);

create function public.get_public_shipment_documents(target_tracking_number text)
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
set search_path = public
as $$
  select d.id, d.shipment_id, d.document_name, d.document_type,
    d.document_direction, d.file_url, d.file_size,
    d.visible_to_customer, d.uploaded_at
  from public.shipment_documents d
  join public.shipments s on s.id = d.shipment_id
  where s.tracking_number = trim(target_tracking_number)
    and d.visible_to_customer = true
  order by d.uploaded_at desc, d.id desc;
$$;

revoke all on function public.get_public_shipment_documents(text) from public;
grant execute on function public.get_public_shipment_documents(text) to anon, authenticated;
