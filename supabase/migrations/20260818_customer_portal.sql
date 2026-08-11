create table if not exists public.customer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  notification_preference text not null default 'Email' check (notification_preference in ('Email', 'WhatsApp', 'Email & WhatsApp', 'None')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_shipment_assignments (
  user_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (user_id, shipment_id)
);

create table if not exists public.customer_shipment_reads (
  user_id uuid not null references public.customer_profiles(user_id) on delete cascade,
  shipment_id bigint not null references public.shipments(id) on delete cascade,
  events_read_at timestamptz,
  documents_read_at timestamptz,
  communications_read_at timestamptz,
  primary key (user_id, shipment_id)
);

create index if not exists customer_profiles_email_idx on public.customer_profiles (lower(email));
create index if not exists customer_assignments_shipment_idx on public.customer_shipment_assignments (shipment_id);

alter table public.customer_profiles enable row level security;
alter table public.customer_shipment_assignments enable row level security;
alter table public.customer_shipment_reads enable row level security;

create or replace function public.create_customer_profile_for_auth_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.raw_user_meta_data ->> 'account_type' = 'customer' then
    insert into public.customer_profiles(user_id, full_name, email)
    values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), new.email)
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists create_customer_profile_after_signup on auth.users;
create trigger create_customer_profile_after_signup after insert on auth.users
for each row execute function public.create_customer_profile_for_auth_user();

create or replace function public.customer_owns_shipment(target_shipment_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.customer_shipment_assignments a where a.user_id = auth.uid() and a.shipment_id = target_shipment_id); $$;

create or replace function public.is_customer()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.customer_profiles p where p.user_id = auth.uid()); $$;

create or replace function public.sync_customer_shipments()
returns integer language plpgsql security definer set search_path = public
as $$
declare affected integer;
begin
  if not public.is_customer() then raise exception 'Customer profile required'; end if;
  insert into public.customer_shipment_assignments(user_id, shipment_id)
  select auth.uid(), s.id from public.shipments s
  join public.customer_profiles p on p.user_id = auth.uid()
  where lower(coalesce(s.client_email, '')) = lower(p.email)
     or lower(coalesce(s.receiver_email, '')) = lower(p.email)
  on conflict do nothing;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.mark_customer_shipment_read(target_shipment_id bigint)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.customer_owns_shipment(target_shipment_id) then raise exception 'Shipment access denied'; end if;
  insert into public.customer_shipment_reads(user_id, shipment_id, events_read_at, documents_read_at, communications_read_at)
  values (auth.uid(), target_shipment_id, now(), now(), now())
  on conflict (user_id, shipment_id) do update set events_read_at = now(), documents_read_at = now(), communications_read_at = now();
end;
$$;

create or replace function public.get_customer_portal_summary()
returns table (total bigint, active bigint, delivered bigint, pending bigint)
language sql stable security definer set search_path = public
as $$
  select count(*),
    count(*) filter (where lower(coalesce(s.shipment_status, '')) not in ('delivered', 'pending', 'shipment created')),
    count(*) filter (where lower(coalesce(s.shipment_status, '')) = 'delivered'),
    count(*) filter (where lower(coalesce(s.shipment_status, '')) in ('pending', 'shipment created', ''))
  from public.shipments s
  join public.customer_shipment_assignments a on a.shipment_id = s.id and a.user_id = auth.uid();
$$;

create or replace function public.get_customer_unread_counts()
returns table (communications bigint, documents bigint, events bigint)
language sql stable security definer set search_path = public
as $$
  select
    (select count(*) from public.shipment_communications c join public.customer_shipment_assignments a on a.shipment_id = c.shipment_id and a.user_id = auth.uid() left join public.customer_shipment_reads r on r.user_id = auth.uid() and r.shipment_id = c.shipment_id where c.visible_to_customer and c.created_at > coalesce(r.communications_read_at, '-infinity'::timestamptz)),
    (select count(*) from public.shipment_documents d join public.customer_shipment_assignments a on a.shipment_id = d.shipment_id and a.user_id = auth.uid() left join public.customer_shipment_reads r on r.user_id = auth.uid() and r.shipment_id = d.shipment_id where d.visible_to_customer and d.uploaded_at > coalesce(r.documents_read_at, '-infinity'::timestamptz)),
    (select count(*) from public.shipment_events e join public.customer_shipment_assignments a on a.shipment_id = e.shipment_id and a.user_id = auth.uid() left join public.customer_shipment_reads r on r.user_id = auth.uid() and r.shipment_id = e.shipment_id where e.created_at > coalesce(r.events_read_at, '-infinity'::timestamptz));
$$;

drop policy if exists "Customers manage own profile" on public.customer_profiles;
create policy "Customers manage own profile" on public.customer_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Customers read own shipment assignments" on public.customer_shipment_assignments;
create policy "Customers read own shipment assignments" on public.customer_shipment_assignments for select to authenticated using (user_id = auth.uid());
drop policy if exists "Customers manage own shipment reads" on public.customer_shipment_reads;
create policy "Customers manage own shipment reads" on public.customer_shipment_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Customer shipment isolation" on public.shipments;
create policy "Customer shipment isolation" on public.shipments as restrictive for select to authenticated using (not public.is_customer() or public.customer_owns_shipment(id));
drop policy if exists "Customer history isolation" on public.shipment_history;
create policy "Customer history isolation" on public.shipment_history as restrictive for select to authenticated using (not public.is_customer() or public.customer_owns_shipment(shipment_id));
drop policy if exists "Customer event isolation" on public.shipment_events;
create policy "Customer event isolation" on public.shipment_events as restrictive for select to authenticated using (not public.is_customer() or public.customer_owns_shipment(shipment_id));
drop policy if exists "Customer snapshot isolation" on public.shipment_route_snapshots;
create policy "Customer snapshot isolation" on public.shipment_route_snapshots as restrictive for select to authenticated using (not public.is_customer() or public.customer_owns_shipment(shipment_id));
drop policy if exists "Customer snapshot stop isolation" on public.shipment_route_stops;
create policy "Customer snapshot stop isolation" on public.shipment_route_stops as restrictive for select to authenticated using (not public.is_customer() or public.customer_owns_shipment(shipment_id));
drop policy if exists "Customer document isolation" on public.shipment_documents;
create policy "Customer document isolation" on public.shipment_documents as restrictive for select to authenticated using (not public.is_customer() or (public.customer_owns_shipment(shipment_id) and visible_to_customer));
drop policy if exists "Customer communication isolation" on public.shipment_communications;
create policy "Customer communication isolation" on public.shipment_communications as restrictive for select to authenticated using (not public.is_customer() or (public.customer_owns_shipment(shipment_id) and visible_to_customer));
drop policy if exists "Customer document file isolation" on storage.objects;
create policy "Customer document file isolation" on storage.objects as restrictive for select to authenticated
using (
  bucket_id <> 'shipment-documents'
  or not public.is_customer()
  or exists (
    select 1 from public.shipment_documents d
    where (d.file_url = storage.objects.name or d.file_url like '%/shipment-documents/' || storage.objects.name)
      and d.visible_to_customer = true
      and public.customer_owns_shipment(d.shipment_id)
  )
);

grant select, update on public.customer_profiles to authenticated;
grant select on public.customer_shipment_assignments to authenticated;
grant select, insert, update on public.customer_shipment_reads to authenticated;
revoke all on function public.customer_owns_shipment(bigint) from public;
revoke all on function public.is_customer() from public;
revoke all on function public.sync_customer_shipments() from public;
revoke all on function public.mark_customer_shipment_read(bigint) from public;
revoke all on function public.get_customer_portal_summary() from public;
revoke all on function public.get_customer_unread_counts() from public;
grant execute on function public.customer_owns_shipment(bigint) to authenticated;
grant execute on function public.is_customer() to authenticated;
grant execute on function public.sync_customer_shipments() to authenticated;
grant execute on function public.mark_customer_shipment_read(bigint) to authenticated;
grant execute on function public.get_customer_portal_summary() to authenticated;
grant execute on function public.get_customer_unread_counts() to authenticated;
