-- RPC: Remove a single product from a sponsored section
CREATE OR REPLACE FUNCTION admin_remove_sponsored_product(
  p_section TEXT,
  p_product_id UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  IF p_section NOT IN ('featured', 'trending', 'hot-deals') THEN
    RAISE EXCEPTION 'Invalid section.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admin can modify sponsored sections.';
  END IF;

  DELETE FROM public.sponsored_products
  WHERE section = p_section
    AND product_id = p_product_id
    AND is_active = true
    AND end_at > now();
END;
$$;

-- RPC: Add products to a sponsored section (appends, does not replace)
CREATE OR REPLACE FUNCTION admin_add_sponsored_products(
  p_section TEXT,
  p_seller_id UUID,
  p_product_ids UUID[],
  p_start_at TIMESTAMPTZ,
  p_end_at TIMESTAMPTZ
) RETURNS VOID
LANGUAGE plpgsql
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

  IF p_end_at <= p_start_at
     OR p_end_at - p_start_at < INTERVAL '24 hours'
     OR p_end_at - p_start_at > INTERVAL '30 days' THEN
    RAISE EXCEPTION 'Duration must be between 24 hours and 30 days.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only admin can modify sponsored sections.';
  END IF;

  -- Count existing products in this section
  SELECT COUNT(*) INTO v_current_count
  FROM public.sponsored_products
  WHERE section = p_section AND is_active = true AND end_at > now();

  IF v_current_count + array_length(p_product_ids, 1) > 20 THEN
    RAISE EXCEPTION 'Section would exceed 20 products limit. Currently % products.', v_current_count;
  END IF;

  FOREACH v_product_id IN ARRAY p_product_ids
  LOOP
    -- Skip if already in this section
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
