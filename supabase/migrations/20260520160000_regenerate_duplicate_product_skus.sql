-- =============================================================================
-- Regenerate fresh, unique product-level SKUs for products that currently share
-- a SKU with another product (37 duplicated SKUs / 110 affected rows).
--
-- Strategy:
--   • Keep the OLDEST product per duplicated SKU with its existing SKU.
--   • Assign a fresh SKU to every newer duplicate.
--   • New SKUs use prefix "BZD99" + 7-digit zero-padded counter, starting at
--     BZD99000001. Max existing BZD-numeric tail is 32699005, so the BZD99…
--     range cannot collide with any current SKU.
--   • Variant-level SKUs (product_variants.sku) are NOT touched — they are
--     independent and already unique enough.
--   • cart_items / order_items reference products by product_id, not SKU, so
--     no downstream backfill is needed.
-- =============================================================================

BEGIN;

-- 1. Build the renaming plan: rank duplicates per SKU by created_at, oldest=1.
--    Anyone with rk > 1 gets a new SKU.
WITH dup_skus AS (
    SELECT sku
    FROM public.products
    WHERE sku IS NOT NULL AND length(trim(sku)) > 0
    GROUP BY sku
    HAVING count(*) > 1
),
ranked AS (
    SELECT
        p.id,
        p.sku                                                    AS old_sku,
        row_number() OVER (PARTITION BY p.sku ORDER BY p.created_at ASC, p.id ASC) AS rk
    FROM public.products p
    JOIN dup_skus d ON d.sku = p.sku
),
to_rename AS (
    SELECT
        id,
        old_sku,
        'BZD99' || lpad((row_number() OVER (ORDER BY old_sku, id))::text, 7, '0') AS new_sku
    FROM ranked
    WHERE rk > 1
)
UPDATE public.products p
SET sku = tr.new_sku,
    updated_at = now()
FROM to_rename tr
WHERE p.id = tr.id;

-- 2. Sanity: no duplicate product SKUs remain.
DO $$
DECLARE
    v_dups integer;
BEGIN
    SELECT count(*) INTO v_dups
    FROM (
        SELECT sku FROM public.products
        WHERE sku IS NOT NULL AND length(trim(sku)) > 0
        GROUP BY sku HAVING count(*) > 1
    ) x;
    IF v_dups > 0 THEN
        RAISE EXCEPTION 'duplicate product SKUs still present: % distinct duplicated SKUs', v_dups;
    END IF;
END $$;

-- 3. Sanity: every renamed SKU is unique against the entire products table
--    (defensive — should already be guaranteed by step 1).
DO $$
DECLARE
    v_collision integer;
BEGIN
    SELECT count(*) INTO v_collision
    FROM public.products p
    WHERE p.sku LIKE 'BZD99%'
      AND EXISTS (
          SELECT 1 FROM public.products p2
          WHERE p2.id <> p.id AND p2.sku = p.sku
      );
    IF v_collision > 0 THEN
        RAISE EXCEPTION 'BZD99 SKU collision: % rows', v_collision;
    END IF;
END $$;

COMMIT;
