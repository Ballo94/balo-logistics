ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS vessel_name text;
