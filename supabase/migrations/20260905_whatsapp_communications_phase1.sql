-- Link authoritative shipment communications to WhatsApp delivery attempts.
-- Additive and safe for existing communication and notification records.

begin;

do $block$
begin
  if pg_catalog.to_regclass('public.shipment_communications') is null then
    raise exception 'Required table public.shipment_communications is missing.';
  end if;
  if pg_catalog.to_regclass('public.notification_history') is null then
    raise exception 'Required table public.notification_history is missing.';
  end if;
end;
$block$;

alter table public.notification_history
  add column if not exists communication_id bigint,
  add column if not exists provider text,
  add column if not exists provider_status text,
  add column if not exists recipient_normalized text,
  add column if not exists failed_at timestamptz;

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.notification_history'::pg_catalog.regclass
      and conname = 'notification_history_communication_id_fkey'
  ) then
    alter table public.notification_history
      add constraint notification_history_communication_id_fkey
      foreign key (communication_id) references public.shipment_communications(id)
      on delete set null;
  end if;
end;
$block$;

create index if not exists notification_history_communication_idx
  on public.notification_history (communication_id, created_at desc)
  where communication_id is not null;

create index if not exists notification_history_provider_message_idx
  on public.notification_history (provider, provider_id)
  where provider_id is not null;

commit;
