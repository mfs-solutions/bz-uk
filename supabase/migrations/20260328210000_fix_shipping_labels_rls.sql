-- Fix RLS policies: admin role is in profiles table, not auth.users metadata
DROP POLICY IF EXISTS "Admins can upload shipping labels" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update shipping labels" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete shipping labels" ON storage.objects;

CREATE POLICY "Admins can upload shipping labels"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Admins can update shipping labels"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete shipping labels"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);
