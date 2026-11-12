-- Add shipping-provider routing to seller_pickup_locations.
-- Indian sellers → Shiprocket, non-Indian sellers → Shippo.

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS shippo_synced boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shippo_address_id text;

-- Backfill: anything created so far was Shiprocket.
UPDATE public.seller_pickup_locations
SET provider = 'shiprocket'
WHERE provider IS NULL;

-- Constrain to the two supported providers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seller_pickup_locations_provider_check'
  ) THEN
    ALTER TABLE public.seller_pickup_locations
      ADD CONSTRAINT seller_pickup_locations_provider_check
      CHECK (provider IN ('shiprocket', 'shippo'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_seller_pickup_locations_provider
  ON public.seller_pickup_locations (provider);
