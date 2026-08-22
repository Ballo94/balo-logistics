alter table public.shipments
  add column if not exists insurance_status text not null default 'not_specified';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.shipments'::regclass
      and conname = 'shipments_insurance_status_check'
  ) then
    alter table public.shipments
      add constraint shipments_insurance_status_check
      check (insurance_status in ('insured', 'not_insured', 'not_specified'));
  end if;
end
$$;

alter table public.company_settings
  add column if not exists company_whatsapp text;
