-- =============================================================================
-- Default-variant backfill for products that currently have ZERO variant rows.
--
-- Why: every product must own at least one product_variants row so cart_items
--      and order_items can always carry a real variant_id. No "synthetic"
--      reuse of product_id — each new row gets a fresh gen_random_uuid().
--
-- Scope: 174 products globally (verified 2026-05-20) with no product_variants
--        rows. Source values are copied from products.{sku,price,mrp,stock}.
--        hsn_code stays on products (variants table has no hsn column).
-- =============================================================================

BEGIN;

-- 1. Insert one default variant per no-variant product.
--    id is generated via column default (gen_random_uuid) — distinct from product_id.
INSERT INTO public.product_variants (
    product_id,
    variant_type,
    sku,
    price,
    mrp,
    stock,
    quantity
)
SELECT
    p.id                                                     AS product_id,
    'combination'                                            AS variant_type,
    NULLIF(trim(p.sku), '')                                  AS sku,
    COALESCE(p.price, 0)                                     AS price,
    CASE
        WHEN p.mrp IS NOT NULL AND p.mrp >= COALESCE(p.price, 0) THEN p.mrp
        ELSE round(COALESCE(p.price, 0) * 1.35, 2)
    END                                                      AS mrp,
    COALESCE(p.stock, 0)                                     AS stock,
    COALESCE(p.stock, 0)                                     AS quantity
FROM public.products p
WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id
);

-- Sanity: every product must now have ≥ 1 variant.
DO $$
DECLARE
    v_missing integer;
BEGIN
    SELECT count(*) INTO v_missing
    FROM public.products p
    WHERE NOT EXISTS (SELECT 1 FROM public.product_variants v WHERE v.product_id = p.id);
    IF v_missing > 0 THEN
        RAISE EXCEPTION 'default-variant backfill incomplete: % products still have zero variants', v_missing;
    END IF;
END $$;

-- Sanity: no variant id should ever equal its product_id (defensive — should be impossible with gen_random_uuid()).
DO $$
DECLARE
    v_collision integer;
BEGIN
    SELECT count(*) INTO v_collision
    FROM public.product_variants
    WHERE id = product_id;
    IF v_collision > 0 THEN
        RAISE EXCEPTION 'variant id collides with product_id in % rows', v_collision;
    END IF;
END $$;

-- 2. Backfill cart_items.selected_variant_id for cart rows whose product has
--    exactly one variant, when the cart row had no variant linked yet.
UPDATE public.cart_items ci
SET selected_variant_id = v.id
FROM public.product_variants v
WHERE ci.selected_variant_id IS NULL
  AND v.product_id = ci.product_id
  AND NOT EXISTS (
      SELECT 1 FROM public.product_variants v2
      WHERE v2.product_id = ci.product_id AND v2.id <> v.id
  );

-- 3. Backfill order_items.variant_id for historical orders on single-variant products.
UPDATE public.order_items oi
SET variant_id = v.id
FROM public.product_variants v
WHERE oi.variant_id IS NULL
  AND v.product_id = oi.product_id
  AND NOT EXISTS (
      SELECT 1 FROM public.product_variants v2
      WHERE v2.product_id = oi.product_id AND v2.id <> v.id
  );

COMMIT;
