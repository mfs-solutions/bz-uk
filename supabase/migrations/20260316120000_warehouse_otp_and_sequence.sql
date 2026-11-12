-- Add warehouse_type to seller_pickup_locations (domestic / international)
ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS warehouse_type text NOT NULL DEFAULT 'domestic'
    CHECK (warehouse_type IN ('domestic', 'international'));

-- Seller sequence counter for auto-generating facility codes
CREATE TABLE IF NOT EXISTS public.seller_sequences (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_sequences_seller_id_unique UNIQUE (seller_id)
);

ALTER TABLE public.seller_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can read own sequence"
  ON public.seller_sequences FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can insert own sequence"
  ON public.seller_sequences FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

GRANT SELECT, INSERT ON public.seller_sequences TO authenticated;

-- Pickup location OTP verification table
CREATE TABLE IF NOT EXISTS public.pickup_location_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  otp_code text NOT NULL,
  warehouse_type text NOT NULL DEFAULT 'domestic' CHECK (warehouse_type IN ('domestic', 'international')),
  verified boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pickup_location_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers manage own OTPs"
  ON public.pickup_location_otps FOR ALL
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pickup_location_otps TO authenticated;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_pickup_location_otps_seller
  ON public.pickup_location_otps (seller_id, warehouse_type, verified);
