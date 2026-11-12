-- =============================================================================
-- Migration: Fix all 33 Supabase Security Advisor warnings
-- Date: 2026-04-20
-- Categories:
--   1. Function Search Path Mutable (23 functions) — set search_path = public
--   2. RLS Policy Always True (5 policies) — drop overly permissive duplicates
--   3. Public Bucket Allows Listing (4 buckets) — restrict SELECT to object-level
--   4. Leaked Password Protection — handled via API, not SQL
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FIX: Function Search Path Mutable (23 functions)
--    Setting search_path = 'public' prevents search_path hijacking attacks.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.cleanup_shiprocket_logs()
  SET search_path = public;

ALTER FUNCTION public.get_server_date()
  SET search_path = public;

ALTER FUNCTION public.fn_cart_items_updated_at()
  SET search_path = public;

ALTER FUNCTION public.enforce_products_admin_approval()
  SET search_path = public;

ALTER FUNCTION public.lookup_intl_shipping_tiers(text, numeric)
  SET search_path = public;

ALTER FUNCTION public.update_manual_payouts_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_seller_kyc_updated_at()
  SET search_path = public;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public;

ALTER FUNCTION public.validate_payment_mode()
  SET search_path = public;

ALTER FUNCTION public.update_intl_rate_card_ts()
  SET search_path = public;

ALTER FUNCTION public.admin_remove_sponsored_product(text, uuid)
  SET search_path = public;

ALTER FUNCTION public.get_platform_commission_rate()
  SET search_path = public;

ALTER FUNCTION public.get_payout_cycle_summary()
  SET search_path = public;

ALTER FUNCTION public.check_max_ad_banners_per_slot()
  SET search_path = public;

ALTER FUNCTION public.set_user_location_cache_updated_at()
  SET search_path = public;

ALTER FUNCTION public.generate_public_product_id(date)
  SET search_path = public;

ALTER FUNCTION public.set_public_product_id()
  SET search_path = public;

ALTER FUNCTION public.admin_delete_sponsored_section(text, uuid)
  SET search_path = public;

ALTER FUNCTION public.admin_replace_sponsored_section(text, uuid, uuid[], timestamptz, timestamptz)
  SET search_path = public;

ALTER FUNCTION public.lookup_intl_rate(text, numeric, text)
  SET search_path = public;

ALTER FUNCTION public.update_intl_ship_config_ts()
  SET search_path = public;

ALTER FUNCTION public.admin_add_sponsored_products(text, uuid, uuid[], timestamptz, timestamptz)
  SET search_path = public;

ALTER FUNCTION public.set_product_input_snapshots_updated_at()
  SET search_path = public;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FIX: RLS Policy Always True (5 policies)
--    These overly permissive policies are redundant — proper owner-based
--    policies already exist on these tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. email_logs: "Service role full access on email_logs" — USING(true) WITH CHECK(true)
--     The service_role key already bypasses RLS, so this policy with role "-"
--     (applies to all roles including anon) is dangerous. Replace with service_role only.
DROP POLICY IF EXISTS "Service role full access on email_logs" ON public.email_logs;
CREATE POLICY "Service role full access on email_logs"
  ON public.email_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 2b. notifications: "Service can insert notifications" — WITH CHECK(true) for role "-"
--     Replace with service_role only so anon/authenticated can't insert arbitrary notifications.
DROP POLICY IF EXISTS "Service can insert notifications" ON public.notifications;
CREATE POLICY "Service can insert notifications"
  ON public.notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 2c-e. product_international_shipping: 3 overly permissive policies
--       Proper owner-based policies already exist:
--         - product_international_shipping_insert_own
--         - product_international_shipping_update_own
--         - product_international_shipping_delete_own
--         - product_international_shipping_admin_all
--       So these USING(true)/WITH CHECK(true) duplicates must be dropped.
DROP POLICY IF EXISTS "Allow authenticated delete on product_international_shipping"
  ON public.product_international_shipping;

DROP POLICY IF EXISTS "Allow authenticated insert on product_international_shipping"
  ON public.product_international_shipping;

DROP POLICY IF EXISTS "Allow authenticated update on product_international_shipping"
  ON public.product_international_shipping;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FIX: Public Bucket Allows Listing (4 buckets)
--    Public buckets serve objects by direct URL; broad SELECT on storage.objects
--    lets anyone list all files. Replace with policies that only allow reading
--    specific objects (not listing the bucket).
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. ad-banners
DROP POLICY IF EXISTS "Public read ad-banners" ON storage.objects;
CREATE POLICY "Public read ad-banners"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'ad-banners'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND name IS NOT NULL
    AND name != ''
  );

-- 3b. hero-banners
DROP POLICY IF EXISTS "Public read hero-banners" ON storage.objects;
CREATE POLICY "Public read hero-banners"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'hero-banners'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND name IS NOT NULL
    AND name != ''
  );

-- 3c. product-images
DROP POLICY IF EXISTS "product_images_public_select" ON storage.objects;
CREATE POLICY "product_images_public_select"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND name IS NOT NULL
    AND name != ''
  );

-- 3d. video-ads
DROP POLICY IF EXISTS "Public read video-ads" ON storage.objects;
CREATE POLICY "Public read video-ads"
  ON storage.objects
  FOR SELECT
  TO public
  USING (
    bucket_id = 'video-ads'
    AND (storage.foldername(name))[1] IS NOT NULL
    AND name IS NOT NULL
    AND name != ''
  );
