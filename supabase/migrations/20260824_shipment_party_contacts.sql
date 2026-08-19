-- Additive contact details for shipment senders and receivers.
-- Existing names/emails/receiver contact columns remain authoritative and unchanged.
alter table public.shipments
  add column if not exists client_email text,
  add column if not exists client_company_name text,
  add column if not exists client_phone text,
  add column if not exists client_address text,
  add column if not exists client_receive_updates boolean not null default false,
  add column if not exists receiver_email text,
  add column if not exists receiver_company_name text,
  add column if not exists receiver_receive_updates boolean not null default false;
