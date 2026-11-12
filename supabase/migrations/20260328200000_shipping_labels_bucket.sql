-- Create storage bucket for admin-uploaded shipping labels
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipping-labels', 'shipping-labels', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read labels (sellers download their own order labels)
CREATE POLICY "Authenticated users can read shipping labels"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'shipping-labels');

-- Only admins (service_role) upload labels via admin dashboard
-- Admin uploads go through supabase client with service_role or admin RLS
CREATE POLICY "Admins can upload shipping labels"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_user_meta_data->>'role' = 'admin'
  )
);

-- Admins can overwrite/delete labels
CREATE POLICY "Admins can update shipping labels"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_user_meta_data->>'role' = 'admin'
  )
);

CREATE POLICY "Admins can delete shipping labels"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND raw_user_meta_data->>'role' = 'admin'
  )
);
