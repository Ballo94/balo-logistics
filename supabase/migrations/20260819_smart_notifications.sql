-- Phase 15: Smart Notifications & Automation
-- Idempotent and safe for existing shipment and notification data.

alter table public.notification_history drop constraint if exists notification_history_channel_check;
alter table public.notification_history drop constraint if exists notification_history_event_type_check;
alter table public.notification_history drop constraint if exists notification_history_status_check;

alter table public.notification_history
  add column if not exists notification_type text,
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

alter table public.notification_history alter column notification_type set not null;
alter table public.notification_history alter column status set default 'Pending';

alter table public.notification_history
  add constraint notification_history_channel_check check (channel in ('email','sms','whatsapp','push')),
  add constraint notification_history_status_check check (status in ('Draft','Pending','Scheduled','Processing','Sent','Delivered','Failed','Cancelled','Provider Not Configured')),
  add constraint notification_history_delivery_mode_check check (delivery_mode in ('Send Now','Schedule','Save Only')),
  add constraint notification_history_category_check check (category in ('Information','Delay','Customs','Payment','Arrival','Delivery','Warning','Success','Exception','Route','Document','Event'));

create unique index if not exists notification_history_idempotency_idx
  on public.notification_history(idempotency_key) where idempotency_key is not null;
create index if not exists notification_queue_due_idx
  on public.notification_history(status, scheduled_at) where status in ('Pending','Scheduled');
create index if not exists notification_customer_feed_idx
  on public.notification_history(shipment_id, created_at desc) where customer_visible;

create table if not exists public.notification_dedupe_keys (
  idempotency_key text primary key,
  notification_id uuid not null references public.notification_history(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  notification_type text not null,
  category text not null default 'Information',
  channel text not null default 'email',
  subject text not null,
  message text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(name, channel)
);

create table if not exists public.notification_automation_settings (
  event_type text primary key,
  enabled boolean not null default true,
  category text not null default 'Information',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table if not exists public.notification_system_settings (
  id boolean primary key default true check (id),
  batch_window_minutes integer not null default 5 check (batch_window_minutes between 0 and 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.notification_system_settings(id, batch_window_minutes) values (true, 5) on conflict (id) do nothing;

insert into public.notification_automation_settings(event_type, enabled, category) values
  ('shipment_created', true, 'Information'), ('shipment_collected', true, 'Information'),
  ('in_warehouse', true, 'Information'), ('in_transit', true, 'Information'),
  ('customs_inspection', true, 'Customs'), ('customs_cleared', true, 'Customs'),
  ('delay_reported', true, 'Delay'), ('eta_changed', true, 'Information'),
  ('route_updated', false, 'Route'), ('shipment_event_added', true, 'Event'),
  ('communication_published', true, 'Information'), ('document_published', true, 'Document'),
  ('out_for_delivery', true, 'Delivery'), ('delivered', true, 'Success'),
  ('exception', true, 'Exception'), ('returned', true, 'Warning'), ('cancelled', true, 'Warning')
on conflict (event_type) do nothing;

insert into public.notification_templates(name, notification_type, category, subject, message) values
  ('Shipment created', 'Shipment Created', 'Information', 'Shipment created - {{tracking_number}}', 'Your shipment {{tracking_number}} has been registered with Balo Logistics.'),
  ('In transit', 'In Transit', 'Information', 'Shipment in transit - {{tracking_number}}', 'Your shipment is moving through our logistics network. Current location: {{current_location}}.'),
  ('Customs update', 'Customs Inspection', 'Customs', 'Customs update - {{tracking_number}}', 'Your shipment is undergoing customs processing. We will share another update when clearance is complete.'),
  ('Delivery complete', 'Delivered', 'Success', 'Shipment delivered - {{tracking_number}}', 'Your shipment has been delivered successfully. Thank you for choosing Balo Logistics.'),
  ('Shipment collected', 'Shipment Collected', 'Information', 'Shipment collected - {{tracking_number}}', 'Your shipment has been collected and is moving to the next confirmed checkpoint.'),
  ('Warehouse arrival', 'In Warehouse', 'Arrival', 'Warehouse arrival - {{tracking_number}}', 'Your shipment has arrived at our logistics facility at {{current_location}}.'),
  ('Shipment departed', 'In Transit', 'Information', 'Shipment departed - {{tracking_number}}', 'Your shipment has departed its previous checkpoint and is in transit.'),
  ('Flight departed', 'In Transit', 'Information', 'Flight departed - {{tracking_number}}', 'Your air shipment has departed the confirmed origin airport.'),
  ('Vessel departed', 'In Transit', 'Information', 'Vessel departed - {{tracking_number}}', 'Your sea shipment has departed the confirmed origin port.'),
  ('Customs cleared', 'Customs Cleared', 'Customs', 'Customs cleared - {{tracking_number}}', 'Customs processing is complete and your shipment can continue its journey.'),
  ('Delay update', 'Delay Reported', 'Delay', 'Shipment delay update - {{tracking_number}}', 'Your shipment is experiencing a delay. Our team is monitoring its progress and will share the next confirmed update.'),
  ('Documentation required', 'Exception', 'Warning', 'Documentation required - {{tracking_number}}', 'Additional documentation is required. Please contact Balo Logistics Customer Care for assistance.'),
  ('Ready for delivery', 'Out for Delivery', 'Delivery', 'Ready for delivery - {{tracking_number}}', 'Your shipment is ready for the final delivery stage.'),
  ('Out for delivery', 'Out for Delivery', 'Delivery', 'Out for delivery - {{tracking_number}}', 'Your shipment is with the local delivery team.'),
  ('Customer pickup', 'In Warehouse', 'Arrival', 'Ready for customer pickup - {{tracking_number}}', 'Your shipment is ready for collection at the confirmed Balo Logistics facility.'),
  ('Shipment returned', 'Returned', 'Warning', 'Shipment returned - {{tracking_number}}', 'Your shipment has entered the return process. Contact Customer Care if you need assistance.'),
  ('Shipment cancelled', 'Cancelled', 'Warning', 'Shipment cancelled - {{tracking_number}}', 'This shipment has been cancelled. Contact Customer Care if you believe this requires review.')
on conflict (name, channel) do nothing;

alter table public.customer_profiles
  add column if not exists notification_channels text[] not null default array['email']::text[],
  add column if not exists notification_categories text[] not null default array['Information','Delay','Customs','Payment','Arrival','Delivery','Warning','Success','Exception','Route','Document','Event']::text[];

create or replace function public.notification_human_type(raw_status text)
returns text language sql immutable as $$
  select case lower(trim(coalesce(raw_status,'')))
    when 'shipment created' then 'Shipment Created' when 'created' then 'Shipment Created'
    when 'collected' then 'Shipment Collected' when 'in warehouse' then 'In Warehouse'
    when 'in transit' then 'In Transit' when 'customs inspection' then 'Customs Inspection'
    when 'customs clearance' then 'Customs Cleared' when 'customs cleared' then 'Customs Cleared'
    when 'delayed' then 'Delay Reported' when 'delay' then 'Delay Reported'
    when 'out for delivery' then 'Out for Delivery' when 'delivered' then 'Delivered'
    when 'exception' then 'Exception' when 'returned' then 'Returned'
    when 'cancelled' then 'Cancelled' when 'canceled' then 'Cancelled'
    else initcap(trim(coalesce(raw_status,'Shipment Update'))) end;
$$;

create or replace function public.notification_event_key(raw_status text)
returns text language sql immutable as $$
  select case lower(trim(coalesce(raw_status,'')))
    when 'shipment created' then 'shipment_created' when 'created' then 'shipment_created'
    when 'collected' then 'shipment_collected' when 'in warehouse' then 'in_warehouse'
    when 'in transit' then 'in_transit' when 'customs inspection' then 'customs_inspection'
    when 'customs clearance' then 'customs_cleared' when 'customs cleared' then 'customs_cleared'
    when 'delayed' then 'delay_reported' when 'delay' then 'delay_reported'
    when 'out for delivery' then 'out_for_delivery' when 'delivered' then 'delivered'
    when 'exception' then 'exception' when 'returned' then 'returned'
    when 'cancelled' then 'cancelled' when 'canceled' then 'cancelled'
    else 'status_changed' end;
$$;

create or replace function public.queue_smart_notification(
  target_shipment_id bigint, target_event_type text, target_notification_type text,
  target_category text, target_subject text, target_message text, target_idempotency_key text,
  target_source text default 'automatic'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  existing_id uuid; batched_id uuid; new_id uuid; recipient_email text; window_minutes integer := 5;
  tracking text; location_text text; profile_channels text[]; profile_categories text[];
begin
  select d.notification_id into existing_id from public.notification_dedupe_keys d where d.idempotency_key = target_idempotency_key;
  if existing_id is not null then return existing_id; end if;
  if coalesce((select enabled from public.notification_automation_settings where event_type = target_event_type), true) = false then return null; end if;

  select coalesce(nullif(trim(s.receiver_email),''), nullif(trim(s.client_email),'')), s.tracking_number,
         coalesce(nullif(trim(s.current_location),''), s.origin_country)
    into recipient_email, tracking, location_text from public.shipments s where s.id = target_shipment_id;
  if not found then raise exception 'Shipment % not found', target_shipment_id; end if;

  select p.notification_channels, p.notification_categories into profile_channels, profile_categories
  from public.customer_profiles p where lower(p.email) = lower(recipient_email) limit 1;
  if profile_channels is not null and not ('email' = any(profile_channels)) then return null; end if;
  if profile_categories is not null and not (target_category = any(profile_categories)) then return null; end if;

  select batch_window_minutes into window_minutes from public.notification_system_settings where id = true;
  select n.id into batched_id from public.notification_history n
   where n.shipment_id = target_shipment_id and n.channel = 'email' and n.source = 'automatic'
     and n.status in ('Pending','Scheduled') and n.batch_until > now()
   order by n.created_at desc limit 1 for update;

  target_subject := replace(target_subject, '{{tracking_number}}', coalesce(tracking,''));
  target_message := replace(replace(target_message, '{{tracking_number}}', coalesce(tracking,'')), '{{current_location}}', coalesce(location_text,'Not available'));
  if batched_id is not null and window_minutes > 0 then
    update public.notification_history set
      subject = 'Shipment updates - ' || tracking,
      message = message || E'\n\n' || target_notification_type || E'\n' || target_message,
      batch_event_count = batch_event_count + 1, updated_at = now()
    where id = batched_id;
    insert into public.notification_dedupe_keys values(target_idempotency_key, batched_id, now()) on conflict do nothing;
    return batched_id;
  end if;

  insert into public.notification_history(
    shipment_id, channel, event_type, notification_type, category, recipient, subject, message,
    status, delivery_mode, scheduled_at, batch_until, source, idempotency_key, attempts
  ) values (
    target_shipment_id, 'email', target_event_type, target_notification_type, target_category,
    recipient_email, target_subject, target_message,
    case when window_minutes > 0 then 'Scheduled' else 'Pending' end, 'Schedule',
    now() + make_interval(mins => window_minutes), now() + make_interval(mins => window_minutes),
    target_source, target_idempotency_key, 0
  ) returning id into new_id;
  insert into public.notification_dedupe_keys values(target_idempotency_key, new_id, now()) on conflict do nothing;
  return new_id;
end;
$$;

create or replace function public.queue_shipment_change_notifications()
returns trigger language plpgsql security definer set search_path = public as $$
declare event_key text; human_type text;
begin
  if tg_op = 'INSERT' then
    perform public.queue_smart_notification(new.id, 'shipment_created', 'Shipment Created', 'Information',
      'Shipment created - {{tracking_number}}', 'Your shipment has been registered with Balo Logistics.',
      'shipment:' || new.id || ':created', 'shipment');
    return new;
  end if;
  if new.shipment_status is distinct from old.shipment_status then
    event_key := public.notification_event_key(new.shipment_status); human_type := public.notification_human_type(new.shipment_status);
    perform public.queue_smart_notification(new.id, event_key, human_type,
      coalesce((select category from public.notification_automation_settings where event_type = event_key), 'Information'),
      human_type || ' - {{tracking_number}}',
      case event_key when 'delivered' then 'Your shipment has been delivered successfully.'
        when 'delay_reported' then 'Your shipment is delayed. Our team is monitoring its progress and will share the next confirmed update.'
        when 'customs_inspection' then 'Your shipment is undergoing customs processing.'
        when 'out_for_delivery' then 'Your shipment is with the local delivery team.'
        else 'Your shipment status is now ' || human_type || '. Current location: {{current_location}}.' end,
      'shipment:' || new.id || ':status:' || md5(coalesce(new.shipment_status,'') || ':' || clock_timestamp()::text), 'shipment');
  end if;
  if new.estimated_delivery is distinct from old.estimated_delivery then
    perform public.queue_smart_notification(new.id, 'eta_changed', 'ETA Changed', 'Information', 'Estimated delivery updated - {{tracking_number}}',
      'The estimated delivery for your shipment is now ' || coalesce(new.estimated_delivery::text, 'being reviewed') || '.',
      'shipment:' || new.id || ':eta:' || coalesce(new.estimated_delivery::text,'none'), 'shipment');
  end if;
  if new.route_template_id is distinct from old.route_template_id then
    perform public.queue_smart_notification(new.id, 'route_updated', 'Route Updated', 'Route', 'Shipment route updated - {{tracking_number}}',
      'The operational route for your shipment has been updated.',
      'shipment:' || new.id || ':route:' || coalesce(new.route_template_id::text,'none'), 'shipment');
  end if;
  return new;
end;
$$;

drop trigger if exists queue_shipment_notifications on public.shipments;
create trigger queue_shipment_notifications after insert or update of shipment_status, estimated_delivery, route_template_id
on public.shipments for each row execute function public.queue_shipment_change_notifications();

create or replace function public.queue_related_record_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare kind text; heading text; category_name text; body text; record_id text; is_visible boolean := true;
begin
  if tg_table_name = 'shipment_documents' then
    is_visible := new.visible_to_customer;
    if not is_visible or (tg_op = 'UPDATE' and old.visible_to_customer) then return new; end if;
    kind := 'document_published'; heading := 'Customer Document Published'; category_name := 'Document';
    body := 'A new ' || new.document_type || ' is available in your shipment documents.'; record_id := new.id::text;
  elsif tg_table_name = 'shipment_communications' then
    is_visible := new.visible_to_customer;
    if not is_visible or (tg_op = 'UPDATE' and old.visible_to_customer) then return new; end if;
    kind := 'communication_published'; heading := 'Communication Published'; category_name := 'Information';
    body := new.title || E'\n' || new.message; record_id := new.id::text;
  else
    kind := 'shipment_event_added'; heading := 'Shipment Event Added'; category_name := 'Event';
    body := new.title || coalesce(E'\n' || new.description, ''); record_id := new.id::text;
  end if;
  perform public.queue_smart_notification(new.shipment_id, kind, heading, category_name,
    heading || ' - {{tracking_number}}', body, tg_table_name || ':' || record_id || ':published', tg_table_name);
  return new;
end;
$$;

drop trigger if exists queue_event_notification on public.shipment_events;
create trigger queue_event_notification after insert on public.shipment_events for each row execute function public.queue_related_record_notification();
drop trigger if exists queue_document_notification on public.shipment_documents;
create trigger queue_document_notification after insert or update of visible_to_customer on public.shipment_documents for each row execute function public.queue_related_record_notification();
drop trigger if exists queue_communication_notification on public.shipment_communications;
create trigger queue_communication_notification after insert or update of visible_to_customer on public.shipment_communications for each row execute function public.queue_related_record_notification();

create or replace function public.mark_customer_notification_read(target_notification_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.notification_history set read_at = coalesce(read_at, now()), opened_at = coalesce(opened_at, now()), updated_at = now()
  where id = target_notification_id and customer_visible and public.customer_owns_shipment(shipment_id);
  if not found then raise exception 'Notification access denied'; end if;
end;
$$;

create or replace function public.mark_all_customer_notifications_read()
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer;
begin
  update public.notification_history n set read_at = coalesce(n.read_at, now()), opened_at = coalesce(n.opened_at, now()), updated_at = now()
  where n.customer_visible and public.customer_owns_shipment(n.shipment_id) and n.read_at is null;
  get diagnostics affected = row_count; return affected;
end;
$$;

alter table public.notification_templates enable row level security;
alter table public.notification_automation_settings enable row level security;
alter table public.notification_system_settings enable row level security;
alter table public.notification_dedupe_keys enable row level security;

drop policy if exists "Customer notification isolation" on public.notification_history;
create policy "Customer notification isolation" on public.notification_history as restrictive for select to authenticated
using (not public.is_customer() or (customer_visible and public.customer_owns_shipment(shipment_id)));
drop policy if exists "Customers cannot create notifications" on public.notification_history;
create policy "Customers cannot create notifications" on public.notification_history as restrictive for insert to authenticated
with check (not public.is_customer());
drop policy if exists "Customers cannot modify notifications" on public.notification_history;
create policy "Customers cannot modify notifications" on public.notification_history as restrictive for update to authenticated
using (not public.is_customer()) with check (not public.is_customer());
drop policy if exists "Admins can delete pending notifications" on public.notification_history;
create policy "Admins can delete pending notifications" on public.notification_history for delete to authenticated
using (not public.is_customer() and status in ('Draft','Pending','Scheduled','Cancelled'));

drop policy if exists "Admins manage notification templates" on public.notification_templates;
create policy "Admins manage notification templates" on public.notification_templates for all to authenticated using (not public.is_customer()) with check (not public.is_customer());
drop policy if exists "Admins manage automation settings" on public.notification_automation_settings;
create policy "Admins manage automation settings" on public.notification_automation_settings for all to authenticated using (not public.is_customer()) with check (not public.is_customer());
drop policy if exists "Admins manage notification settings" on public.notification_system_settings;
create policy "Admins manage notification settings" on public.notification_system_settings for all to authenticated using (not public.is_customer()) with check (not public.is_customer());
drop policy if exists "Admins read notification dedupe keys" on public.notification_dedupe_keys;
create policy "Admins read notification dedupe keys" on public.notification_dedupe_keys for select to authenticated using (not public.is_customer());

grant select, insert, update, delete on public.notification_templates to authenticated;
grant select, insert, update on public.notification_automation_settings to authenticated;
grant select, update on public.notification_system_settings to authenticated;
grant select on public.notification_dedupe_keys to authenticated;
revoke all on function public.queue_smart_notification(bigint,text,text,text,text,text,text,text) from public;
revoke all on function public.mark_customer_notification_read(uuid) from public;
revoke all on function public.mark_all_customer_notifications_read() from public;
grant execute on function public.mark_customer_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_customer_notifications_read() to authenticated;
