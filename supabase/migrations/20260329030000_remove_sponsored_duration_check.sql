-- Remove the 24h-30d duration check from admin_add_sponsored_products.
-- Also drop the table-level CHECK constraint that enforces duration.
ALTER TABLE public.sponsored_products DROP CONSTRAINT IF EXISTS sponsored_products_duration_chk;

-- Only require end_at > start_at.
CREATE OR REPLACE FUNCTION public.admin_add_sponsored_products(
  p_section TEXT,
  p_seller_id UUID,
  p_product_ids UUID[],
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_product_id UUID;
  v_current_count INT;
BEGIN
  IF p_section NOT IN ('featured', 'trending', 'hot-deals') THEN
    RAISE EXCEPTION 'Invalid section.';
  END IF;
  IF p_product_ids IS NULL OR COALESCE(array_length(p_product_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one product is required.';
  END IF;
  IF p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'End date must be after start date.';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admin can modify sponsored sections.';
  END IF;
  SELECT COUNT(*) INTO v_current_count
  FROM public.sponsored_products
  WHERE section = p_section AND is_active = true AND end_at > now();
  IF v_current_count + array_length(p_product_ids, 1) > 20 THEN
    RAISE EXCEPTION 'Section would exceed 20 products limit. Currently % products.', v_current_count;
  END IF;
  FOREACH v_product_id IN ARRAY p_product_ids
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.sponsored_products
      WHERE section = p_section AND product_id = v_product_id AND is_active = true AND end_at > now()
    ) THEN
      INSERT INTO public.sponsored_products (
        section, seller_id, product_id, start_at, end_at, is_active, created_by
      ) VALUES (
        p_section, p_seller_id, v_product_id, p_start_at, p_end_at, true, auth.uid()
      );
    END IF;
  END LOOP;
END;
$$;
