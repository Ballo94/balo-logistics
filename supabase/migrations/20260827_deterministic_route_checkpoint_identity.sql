ALTER TABLE public.shipments
ADD COLUMN IF NOT EXISTS current_route_checkpoint_id text;

ALTER TABLE public.shipment_history
ADD COLUMN IF NOT EXISTS route_checkpoint_id text;
