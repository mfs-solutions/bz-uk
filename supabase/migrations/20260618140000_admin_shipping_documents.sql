-- Admin-uploaded shipping label & manifest paths on orders.
-- Sellers may download only after admin sets these columns (storage RLS enforces ownership).

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_label_path text,
  ADD COLUMN IF NOT EXISTS admin_manifest_path text;

COMMENT ON COLUMN public.orders.admin_label_path IS
  'Storage object name in shipping-labels bucket after admin manual upload.';
COMMENT ON COLUMN public.orders.admin_manifest_path IS
  'Storage object name in shipping-manifests bucket after admin manual upload.';

-- Manifest bucket (labels bucket already exists from 20260328200000).
INSERT INTO storage.buckets (id, name, public)
VALUES ('shipping-manifests', 'shipping-manifests', false)
ON CONFLICT (id) DO NOTHING;

-- Replace overly broad label read policy with seller-scoped + admin access.
DROP POLICY IF EXISTS "Authenticated users can read shipping labels" ON storage.objects;

CREATE POLICY "Admins can read shipping labels"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Sellers can read their uploaded shipping labels"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'shipping-labels'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.seller_id = auth.uid()
      AND o.admin_label_path IS NOT NULL
      AND o.admin_label_path = name
  )
);

-- Manifest bucket policies (mirror labels).
CREATE POLICY "Admins can upload shipping manifests"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shipping-manifests'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can update shipping manifests"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'shipping-manifests'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can delete shipping manifests"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'shipping-manifests'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Admins can read shipping manifests"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'shipping-manifests'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Sellers can read their uploaded shipping manifests"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'shipping-manifests'
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.seller_id = auth.uid()
      AND o.admin_manifest_path IS NOT NULL
      AND o.admin_manifest_path = name
  )
);

COMMIT;
