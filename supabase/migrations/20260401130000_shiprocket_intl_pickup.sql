-- Shiprocket international pickup locations created by sellers
-- One row per seller pickup location

CREATE TABLE IF NOT EXISTS public.shiprocket_intl_pickup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pickup_location text NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  address_2 text NOT NULL DEFAULT '',
  city text NOT NULL,
  state text NOT NULL,
  country text NOT NULL DEFAULT 'India',
  pin_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shiprocket_intl_pickup_unique UNIQUE (seller_id, pickup_location)
);

CREATE INDEX IF NOT EXISTS idx_shiprocket_intl_pickup_seller_id
  ON public.shiprocket_intl_pickup (seller_id);

ALTER TABLE public.shiprocket_intl_pickup ENABLE ROW LEVEL SECURITY;

-- Sellers can view their own pickup locations
DROP POLICY IF EXISTS "Sellers can view own intl pickup" ON public.shiprocket_intl_pickup;
CREATE POLICY "Sellers can view own intl pickup"
  ON public.shiprocket_intl_pickup FOR SELECT
  USING (auth.uid() = seller_id);

-- Sellers can insert their own pickup locations
DROP POLICY IF EXISTS "Sellers can insert own intl pickup" ON public.shiprocket_intl_pickup;
CREATE POLICY "Sellers can insert own intl pickup"
  ON public.shiprocket_intl_pickup FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- Sellers can update their own pickup locations
DROP POLICY IF EXISTS "Sellers can update own intl pickup" ON public.shiprocket_intl_pickup;
CREATE POLICY "Sellers can update own intl pickup"
  ON public.shiprocket_intl_pickup FOR UPDATE
  USING (auth.uid() = seller_id);

-- Sellers can delete their own pickup locations
DROP POLICY IF EXISTS "Sellers can delete own intl pickup" ON public.shiprocket_intl_pickup;
CREATE POLICY "Sellers can delete own intl pickup"
  ON public.shiprocket_intl_pickup FOR DELETE
  USING (auth.uid() = seller_id);

-- Admins can do everything
DROP POLICY IF EXISTS "Admins can manage all intl pickup" ON public.shiprocket_intl_pickup;
CREATE POLICY "Admins can manage all intl pickup"
  ON public.shiprocket_intl_pickup FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shiprocket_intl_pickup TO authenticated;

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER shiprocket_intl_pickup_updated_at
  BEFORE UPDATE ON public.shiprocket_intl_pickup
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
