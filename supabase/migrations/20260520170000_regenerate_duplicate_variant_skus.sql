-- =============================================================================
-- Regenerate fresh, unique variant-level SKUs for the 6 product_variants rows
-- whose SKU clashes with another variant row.
--
-- Affected SKUs (pre-migration):
--   • '10'              — 4 variant rows (eyeliner / mascara typos)
--   • 'BZD032610459'    — 2 variant rows (variant accidentally inherited
--                                         the product-level SKU)
--
-- Strategy: keep the OLDEST variant row per duplicate SKU unchanged; rename
-- newer duplicates to "<parent_product_sku>-V<n>" where n increments per
-- product. This guarantees the new SKU is unique against all existing
-- variant SKUs (since product SKUs were just made globally unique).
-- =============================================================================

BEGIN;

WITH dup_skus AS (
    SELECT v.sku
    FROM public.product_variants v
    WHERE v.sku IS NOT NULL AND length(trim(v.sku)) > 0
    GROUP BY v.sku
    HAVING count(*) > 1
),
ranked AS (
    SELECT
        v.id,
        v.product_id,
        v.sku                                                          AS old_sku,
        row_number() OVER (PARTITION BY v.sku ORDER BY v.created_at ASC, v.id ASC) AS rk
    FROM public.product_variants v
    JOIN dup_skus d ON d.sku = v.sku
),
to_rename AS (
    SELECT
        r.id,
        r.product_id,
        r.old_sku,
        p.sku                                                          AS parent_product_sku,
        row_number() OVER (PARTITION BY r.product_id ORDER BY r.id)    AS per_product_seq
    FROM ranked r
    JOIN public.products p ON p.id = r.product_id
    WHERE r.rk > 1
)
UPDATE public.product_variants v
SET sku = tr.parent_product_sku || '-V' || tr.per_product_seq,
    updated_at = now()
FROM to_rename tr
WHERE v.id = tr.id;

-- Sanity: no duplicate variant SKUs remain.
DO $$
DECLARE
    v_dups integer;
BEGIN
    SELECT count(*) INTO v_dups
    FROM (
        SELECT sku FROM public.product_variants
        WHERE sku IS NOT NULL AND length(trim(sku)) > 0
        GROUP BY sku HAVING count(*) > 1
    ) x;
    IF v_dups > 0 THEN
        RAISE EXCEPTION 'duplicate variant SKUs still present: % distinct duplicated SKUs', v_dups;
    END IF;
END $$;

COMMIT;
