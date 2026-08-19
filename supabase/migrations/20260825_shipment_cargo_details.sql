-- Shipment-specific cargo references. These values do not belong to reusable routes.
alter table public.shipments
  add column if not exists dimensions text,
  add column if not exists container_number text,
  add column if not exists seal_number text;
