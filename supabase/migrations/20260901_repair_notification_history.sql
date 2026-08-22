-- Restore the notification audit table expected by the existing application.
-- This migration intentionally does not enable automatic notification triggers.

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

create table if not exists public.notification_history (
  id uuid primary key default gen_random_uuid(),
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  channel text not null,
  event_type text not null,
  notification_type text not null default 'Shipment Update',
  category text not null default 'Information',
  recipient text,
  subject text,
  message text not null,
  html_message text,
  status text not null default 'Pending',
  delivery_mode text not null default 'Send Now',
  scheduled_at timestamptz,
  batch_until timestamptz,
  batch_event_count integer not null default 1,
  idempotency_key text,
  source text not null default 'manual',
  customer_visible boolean not null default true,
  provider_id text,
  error_message text,
  attempts integer not null default 1,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  opened_at timestamptz,
  read_at timestamptz
);

alter table public.notification_history
  add column if not exists notification_type text default 'Shipment Update',
  add column if not exists category text not null default 'Information',
  add column if not exists delivery_mode text not null default 'Send Now',
  add column if not exists scheduled_at timestamptz,
  add column if not exists batch_until timestamptz,
  add column if not exists batch_event_count integer not null default 1,
  add column if not exists idempotency_key text,
  add column if not exists source text not null default 'manual',
  add column if not exists customer_visible boolean not null default true,
  add column if not exists html_message text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists delivered_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.notification_history
set notification_type = initcap(replace(event_type, '_', ' '))
where notification_type is null;

alter table public.notification_history
  alter column notification_type set default 'Shipment Update',
  alter column notification_type set not null,
  alter column status set default 'Pending';

alter table public.notification_history
  drop constraint if exists notification_history_channel_check,
  drop constraint if exists notification_history_event_type_check,
  drop constraint if exists notification_history_status_check,
  drop constraint if exists notification_history_delivery_mode_check,
  drop constraint if exists notification_history_category_check;

alter table public.notification_history
  add constraint notification_history_channel_check
    check (channel in ('email', 'sms', 'whatsapp', 'push')),
  add constraint notification_history_status_check
    check (status in ('Draft', 'Pending', 'Scheduled', 'Processing', 'Sent', 'Delivered', 'Failed', 'Cancelled', 'Provider Not Configured')),
  add constraint notification_history_delivery_mode_check
    check (delivery_mode in ('Send Now', 'Schedule', 'Save Only')),
  add constraint notification_history_category_check
    check (category in ('Information', 'Delay', 'Customs', 'Payment', 'Arrival', 'Delivery', 'Warning', 'Success', 'Exception', 'Route', 'Document', 'Event'));

create index if not exists notification_history_shipment_id_idx
  on public.notification_history (shipment_id);
create index if not exists notification_history_created_at_idx
  on public.notification_history (created_at desc);
create unique index if not exists notification_history_idempotency_idx
  on public.notification_history (idempotency_key)
  where idempotency_key is not null;
create index if not exists notification_queue_due_idx
  on public.notification_history (status, scheduled_at)
  where status in ('Pending', 'Scheduled');
create index if not exists notification_customer_feed_idx
  on public.notification_history (shipment_id, created_at desc)
  where customer_visible;

alter table public.notification_history enable row level security;

drop policy if exists "Authenticated admins can view notifications" on public.notification_history;
drop policy if exists "Authenticated admins can create notifications" on public.notification_history;
drop policy if exists "Authenticated admins can update notifications" on public.notification_history;
drop policy if exists "Customer notification isolation" on public.notification_history;
drop policy if exists "Customers cannot create notifications" on public.notification_history;
drop policy if exists "Customers cannot modify notifications" on public.notification_history;
drop policy if exists "Admins can delete pending notifications" on public.notification_history;
drop policy if exists "Administrators can read notifications" on public.notification_history;
drop policy if exists "Administrators can create notifications" on public.notification_history;
drop policy if exists "Administrators can update notifications" on public.notification_history;
drop policy if exists "Administrators can delete pending notifications" on public.notification_history;

create policy "Administrators can read notifications"
  on public.notification_history for select to authenticated
  using ((select public.is_admin()));

create policy "Administrators can create notifications"
  on public.notification_history for insert to authenticated
  with check ((select public.is_admin()));

create policy "Administrators can update notifications"
  on public.notification_history for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Administrators can delete pending notifications"
  on public.notification_history for delete to authenticated
  using (
    (select public.is_admin())
    and status in ('Draft', 'Pending', 'Scheduled', 'Cancelled')
  );

do $block$
begin
  if to_regprocedure('public.is_customer()') is not null
     and to_regprocedure('public.customer_owns_shipment(bigint)') is not null then
    execute $policy$
      create policy "Customers can read assigned visible notifications"
        on public.notification_history for select to authenticated
        using (
          public.is_customer()
          and customer_visible
          and public.customer_owns_shipment(shipment_id)
        )
    $policy$;
  end if;
exception
  when duplicate_object then null;
end;
$block$;

revoke all on table public.notification_history from anon;
grant select, insert, update, delete on table public.notification_history to authenticated;
