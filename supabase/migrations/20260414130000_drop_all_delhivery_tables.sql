-- Complete Delhivery removal: drop all Delhivery tables and fix products.preferred_carrier
-- Shiprocket is now the sole India domestic + international provider.

-- 1. Drop all Delhivery tables (CASCADE handles foreign keys + policies)
DROP TABLE IF EXISTS public.delhivery_document_events CASCADE;
DROP TABLE IF EXISTS public.delhivery_tracking_events CASCADE;
DROP TABLE IF EXISTS public.delhivery_ndr_actions CASCADE;
DROP TABLE IF EXISTS public.delhivery_pickup_requests CASCADE;
DROP TABLE IF EXISTS public.delhivery_operation_logs CASCADE;
DROP TABLE IF EXISTS public.delhivery_webhook_events CASCADE;
DROP TABLE IF EXISTS public.delhivery_shipments CASCADE;
DROP TABLE IF EXISTS public.delhivery_seller_sync_events CASCADE;
DROP TABLE IF EXISTS public.delhivery_seller_sync CASCADE;
DROP TABLE IF EXISTS public.product_delhivery_shipping CASCADE;
DROP TABLE IF EXISTS public.seller_delhivery_accounts CASCADE;

-- 2. Fix products.preferred_carrier: change default from 'delhivery' to 'shiprocket'
--    and update existing rows + constraint
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_preferred_carrier_check;

UPDATE public.products
  SET preferred_carrier = 'shiprocket'
  WHERE preferred_carrier = 'delhivery';

ALTER TABLE public.products
  ALTER COLUMN preferred_carrier SET DEFAULT 'shiprocket';

ALTER TABLE public.products
  ADD CONSTRAINT products_preferred_carrier_check
  CHECK (preferred_carrier IN ('shiprocket', 'shippo'));

-- 3. Remove 'Delhivery' from domestic_courier_type and add 'Shiprocket' if missing
DELETE FROM public.domestic_courier_type WHERE lower(name) = 'delhivery';

INSERT INTO public.domestic_courier_type (name)
SELECT 'Shiprocket'
WHERE NOT EXISTS (
  SELECT 1 FROM public.domestic_courier_type WHERE lower(name) = 'shiprocket'
);
