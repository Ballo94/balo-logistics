alter table public.shipments
  add column if not exists client_email text,
  add column if not exists receiver_email text;

create table if not exists public.notification_history (
  id uuid primary key default gen_random_uuid(),
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp')),
  event_type text not null check (event_type in ('shipment_created', 'status_changed', 'delivered', 'manual')),
  recipient text,
  subject text,
  message text not null,
  status text not null default 'Pending' check (status in ('Sent', 'Failed', 'Pending')),
  provider_id text,
  error_message text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notification_history_shipment_id_idx on public.notification_history(shipment_id);
create index if not exists notification_history_created_at_idx on public.notification_history(created_at desc);

alter table public.notification_history enable row level security;

drop policy if exists "Authenticated admins can view notifications" on public.notification_history;
create policy "Authenticated admins can view notifications"
  on public.notification_history for select to authenticated using (true);

drop policy if exists "Authenticated admins can create notifications" on public.notification_history;
create policy "Authenticated admins can create notifications"
  on public.notification_history for insert to authenticated with check (true);

drop policy if exists "Authenticated admins can update notifications" on public.notification_history;
create policy "Authenticated admins can update notifications"
  on public.notification_history for update to authenticated using (true) with check (true);
