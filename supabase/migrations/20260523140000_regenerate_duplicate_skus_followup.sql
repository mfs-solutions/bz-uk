-- =============================================================================
-- Follow-up dedupe: re-SKU 4 duplicate product-SKU groups and 1 duplicate
-- variant-SKU group that re-appeared after the 20260520160000/170000 fixes.
--
-- Strategy mirrors the original migrations:
--   • Products: keep OLDEST per duplicated SKU; rename newer rows to
--     'BZD99' + 7-digit counter starting AFTER the current max BZD99 SKU.
--   • Variants: keep OLDEST per duplicated SKU; rename newer rows to
--     '<parent_product_sku>-V<n>' computed AFTER the product rename above,
--     so the new variant SKU references the (now-unique) parent SKU.
--
-- NOTE: The 3 "Conversion rate table for different amounts ..." product rows
-- under SKU BZD032610867 look like scraper junk but are NOT deleted here —
-- they are just made SKU-unique, pending a separate manual review.
-- =============================================================================

BEGIN;

-- 1. Compute next BZD99 counter.
DO $$
DECLARE
    v_max_99 bigint;
BEGIN
    SELECT COALESCE(
        MAX(NULLIF(regexp_replace(sku, '^BZD99', ''), '')::bigint),
        0
    ) INTO v_max_99
    FROM public.products
    WHERE sku ~ '^BZD99[0-9]+$';

    -- Temp table to carry the starting counter into the next CTE.
    CREATE TEMP TABLE _next_99 ON COMMIT DROP AS SELECT v_max_99 AS max_99;
END $$;

-- 2. Rename duplicate product SKUs (keep oldest per SKU).
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
        p.sku AS old_sku,
        row_number() OVER (PARTITION BY p.sku ORDER BY p.created_at ASC, p.id ASC) AS rk
    FROM public.products p
    JOIN dup_skus d ON d.sku = p.sku
),
to_rename AS (
    SELECT
        r.id,
        r.old_sku,
        'BZD99' || lpad(
            ((SELECT max_99 FROM _next_99)
                + row_number() OVER (ORDER BY r.old_sku, r.id))::text,
            7, '0'
        ) AS new_sku
    FROM ranked r
    WHERE r.rk > 1
)
UPDATE public.products p
SET sku = tr.new_sku,
    updated_at = now()
FROM to_rename tr
WHERE p.id = tr.id;

-- 3. Rename duplicate variant SKUs (keep oldest per SKU). Parent product SKU
--    is now globally unique after step 2, so we can safely embed it.
WITH dup_vskus AS (
    SELECT sku
    FROM public.product_variants
    WHERE sku IS NOT NULL AND length(trim(sku)) > 0
    GROUP BY sku
    HAVING count(*) > 1
),
ranked_v AS (
    SELECT
        v.id,
        v.product_id,
        v.sku AS old_sku,
        row_number() OVER (PARTITION BY v.sku ORDER BY v.created_at ASC, v.id ASC) AS rk
    FROM public.product_variants v
    JOIN dup_vskus d ON d.sku = v.sku
),
to_rename_v AS (
    SELECT
        rv.id,
        p.sku AS parent_product_sku,
        row_number() OVER (PARTITION BY rv.product_id ORDER BY rv.id) AS per_product_seq
    FROM ranked_v rv
    JOIN public.products p ON p.id = rv.product_id
    WHERE rv.rk > 1
)
UPDATE public.product_variants v
SET sku = tr.parent_product_sku || '-V' || tr.per_product_seq,
    updated_at = now()
FROM to_rename_v tr
WHERE v.id = tr.id;

-- 4. Sanity: no duplicate product SKUs.
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
        RAISE EXCEPTION 'duplicate product SKUs still present: % groups', v_dups;
    END IF;
END $$;

-- 5. Sanity: no duplicate variant SKUs.
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
        RAISE EXCEPTION 'duplicate variant SKUs still present: % groups', v_dups;
    END IF;
END $$;

COMMIT;
