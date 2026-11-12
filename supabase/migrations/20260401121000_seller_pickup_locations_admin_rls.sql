-- Add admin RLS policies for seller_pickup_locations table
-- Admins need full access to manage pickup locations for all sellers

DROP POLICY IF EXISTS "Admins can view all pickup locations" ON public.seller_pickup_locations;
CREATE POLICY "Admins can view all pickup locations"
  ON public.seller_pickup_locations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert pickup locations" ON public.seller_pickup_locations;
CREATE POLICY "Admins can insert pickup locations"
  ON public.seller_pickup_locations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update pickup locations" ON public.seller_pickup_locations;
CREATE POLICY "Admins can update pickup locations"
  ON public.seller_pickup_locations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete pickup locations" ON public.seller_pickup_locations;
CREATE POLICY "Admins can delete pickup locations"
  ON public.seller_pickup_locations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Also grant UPDATE to authenticated users (was missing)
GRANT UPDATE ON public.seller_pickup_locations TO authenticated;
