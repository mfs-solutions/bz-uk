-- Add is_verified to seller_pickup_locations so we can track OTP
-- verification status per pickup location

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

-- Allow sellers to update their own pickup locations (mark as verified)
CREATE POLICY "Sellers can update own pickup locations"
  ON public.seller_pickup_locations FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

GRANT UPDATE ON public.seller_pickup_locations TO authenticated;
