-- Track which seller created each pickup location
-- so each seller only sees their own locations

CREATE TABLE IF NOT EXISTS public.seller_pickup_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pickup_location_name text NOT NULL,
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT '',
  pin_code text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'India',
  contact_name text NOT NULL DEFAULT '',
  contact_phone text NOT NULL DEFAULT '',
  contact_email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_pickup_locations_unique UNIQUE (seller_id, pickup_location_name)
);

CREATE INDEX IF NOT EXISTS idx_seller_pickup_locations_seller_id
  ON public.seller_pickup_locations (seller_id);

ALTER TABLE public.seller_pickup_locations ENABLE ROW LEVEL SECURITY;

-- Sellers can only see their own pickup locations
CREATE POLICY "Sellers can view own pickup locations"
  ON public.seller_pickup_locations FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can insert own pickup locations"
  ON public.seller_pickup_locations FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete own pickup locations"
  ON public.seller_pickup_locations FOR DELETE
  USING (auth.uid() = seller_id);

-- Grant access
GRANT SELECT, INSERT, DELETE ON public.seller_pickup_locations TO authenticated;
