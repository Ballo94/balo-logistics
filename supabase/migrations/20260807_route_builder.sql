create table if not exists public.route_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  transport_mode text not null check (transport_mode in ('Air', 'Sea', 'Road', 'Multimodal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  route_template_id uuid not null references public.route_templates(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null check (length(trim(name)) > 0),
  country text not null check (length(trim(country)) > 0),
  city text not null check (length(trim(city)) > 0),
  stop_type text not null check (stop_type in ('warehouse', 'airport', 'port', 'border', 'distribution_centre', 'customs', 'customer_address')),
  code text,
  operational_notes text,
  onward_transport text check (onward_transport is null or onward_transport in ('Air', 'Sea', 'Road')),
  created_at timestamptz not null default now(),
  unique (route_template_id, position)
);

alter table public.shipments
  add column if not exists route_template_id uuid references public.route_templates(id) on delete set null;

create index if not exists route_stops_template_position_idx on public.route_stops(route_template_id, position);
create index if not exists shipments_route_template_id_idx on public.shipments(route_template_id);

alter table public.route_templates enable row level security;
alter table public.route_stops enable row level security;

drop policy if exists "Public can read route templates" on public.route_templates;
create policy "Public can read route templates" on public.route_templates for select using (true);
drop policy if exists "Authenticated admins can create route templates" on public.route_templates;
create policy "Authenticated admins can create route templates" on public.route_templates for insert to authenticated with check (true);
drop policy if exists "Authenticated admins can update route templates" on public.route_templates;
create policy "Authenticated admins can update route templates" on public.route_templates for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated admins can delete route templates" on public.route_templates;
create policy "Authenticated admins can delete route templates" on public.route_templates for delete to authenticated using (true);

drop policy if exists "Public can read route stops" on public.route_stops;
create policy "Public can read route stops" on public.route_stops for select using (true);
drop policy if exists "Authenticated admins can create route stops" on public.route_stops;
create policy "Authenticated admins can create route stops" on public.route_stops for insert to authenticated with check (true);
drop policy if exists "Authenticated admins can update route stops" on public.route_stops;
create policy "Authenticated admins can update route stops" on public.route_stops for update to authenticated using (true) with check (true);
drop policy if exists "Authenticated admins can delete route stops" on public.route_stops;
create policy "Authenticated admins can delete route stops" on public.route_stops for delete to authenticated using (true);
