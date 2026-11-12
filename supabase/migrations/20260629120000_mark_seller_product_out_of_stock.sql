-- Atomically remove a seller-owned product and all of its variants from inventory.
-- Approval and publication fields are deliberately not changed.
CREATE OR REPLACE FUNCTION public.mark_seller_product_out_of_stock(
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid;
  v_variant_count integer;
BEGIN
  SELECT id
    INTO v_product_id
    FROM public.products
   WHERE id = p_product_id
     AND seller_id = auth.uid()
   FOR UPDATE;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'Product not found or you do not have permission to update it';
  END IF;

  UPDATE public.products
     SET stock = 0
   WHERE id = v_product_id;

  UPDATE public.product_variants
     SET stock = 0,
         quantity = 0
   WHERE product_id = v_product_id;

  GET DIAGNOSTICS v_variant_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'product_id', v_product_id,
    'variant_count', v_variant_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_seller_product_out_of_stock(uuid) TO authenticated;