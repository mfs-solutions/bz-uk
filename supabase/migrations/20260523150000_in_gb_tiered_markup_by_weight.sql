-- ============================================================================
-- 20260523150000_in_gb_tiered_markup_by_weight.sql
--
-- IN → GB tiered markup recomputation by (package weight band × price band).
--
-- WHY: Earlier flat-65 % and zero-markup states did not cover Shiprocket cost
-- (₹426 – ₹2 479) + Stripe 3 % + FX 2 % + a per-order Bzead profit floor.
-- This migration applies the operator-approved tiered markup matrix so that
-- every IN→GB order yields ≥ ₹90 – ₹125 net profit after gateway/FX/shipping
-- (seller payout is treated separately via the 9 % platform commission).
--
-- Affected table: public.product_country_selling_prices (country = GB)
-- Affected products: India-origin, with valid package_weight + weight unit.
--
-- IDEMPOTENT: re-running with identical catalogue produces no further changes.
-- A run-scoped backup table is created the first time only.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) Backup current GB rows for every IN product touched by this migration.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._pcsp_backup_20260523_in_gb_tiered AS
SELECT pcsp.*, NOW() AS backed_up_at
FROM public.product_country_selling_prices pcsp
JOIN public.products p          ON p.id = pcsp.product_id
JOIN public.measurement_units mu ON mu.id = p.package_weight_unit_id
JOIN public.countries c          ON c.id = pcsp.country_id
WHERE p.origin_country = 'India'
  AND c.iso2 = 'GB'
  AND p.package_weight IS NOT NULL
  AND mu.code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1) Compute weight in grams + price band + weight band, then assign markup.
--    The matrix below was approved by the operator on 2026-05-23.
--
--    Weight band     |  Price band         | Markup %  | Action
--    ----------------+---------------------+-----------+----------------------
--    ≤ 200 g         |   0 – 300           |    60     | update
--    ≤ 200 g         | 301 – 500           |    45     | update
--    ≤ 200 g         | 501 – 750           |    35     | update
--    ≤ 200 g         | 751 – 1 000         |    30     | update
--    ≤ 200 g         | 1 001 – 1 500       |    25     | update
--    ≤ 200 g         | 1 501 – 2 000       |    20     | update
--    ≤ 200 g         | 2 001 – 5 000       |    15     | update
--    ≤ 200 g         | > 5 000             |    10     | update
--    ----------------+---------------------+-----------+----------------------
--    201 – 450 g     |   0 – 300           |    85     | update
--    201 – 450 g     | 301 – 500           |    65     | update
--    201 – 450 g     | 501 – 750           |    55     | update
--    201 – 450 g     | 751 – 1 000         |    45     | update
--    201 – 450 g     | 1 001 – 1 500       |    35     | update
--    201 – 450 g     | 1 501 – 2 000       |    20     | update
--    201 – 450 g     | 2 001 – 5 000       |    10     | update
--    201 – 450 g     | > 5 000             |     8     | update
--    ----------------+---------------------+-----------+----------------------
--    451 – 750 g     |   0 – 500           |   NULL    | flagged  (skip)
--    451 – 750 g     | 501 – 750           |    85     | update
--    451 – 750 g     | 751 – 1 000         |    60     | update
--    451 – 750 g     | 1 001 – 1 500       |    40     | update
--    451 – 750 g     | 1 501 – 2 000       |    30     | update
--    451 – 750 g     | 2 001 – 5 000       |    20     | update
--    451 – 750 g     | > 5 000             |    10     | update
--    ----------------+---------------------+-----------+----------------------
--    751 – 1 000 g   |   0 – 1 000         |   NULL    | flagged  (skip)
--    751 – 1 000 g   | 1 001 – 2 000       |    80     | update
--    751 – 1 000 g   | 2 001 – 5 000       |    40     | update
--    751 – 1 000 g   | > 5 000             |    15     | update
--    ----------------+---------------------+-----------+----------------------
--    1 001 – 1 500 g |   0 – 2 000         |   NULL    | flagged  (skip)
--    1 001 – 1 500 g | 2 001 – 5 000       |    40     | update
--    1 001 – 1 500 g | > 5 000             |    25     | update
--    ----------------+---------------------+-----------+----------------------
--    1 501 – 2 000 g |   0 – 2 500         |   NULL    | flagged  (skip)
--    1 501 – 2 000 g | 2 501 – 3 000       |    40     | update
--    1 501 – 2 000 g | 3 001 – 5 000       |    35     | update
--    1 501 – 2 000 g | > 5 000             |    20     | update
--    ----------------+---------------------+-----------+----------------------
--    > 2 000 g       | (any price)         |    20     | update  (heavy default)
--
--    Flagged products (37 total at time of authoring) keep their existing
--    pcsp row untouched.
-- ----------------------------------------------------------------------------

WITH product_meta AS (
  SELECT
    p.id   AS product_id,
    p.price,
    (CASE UPPER(mu.code)
        WHEN 'G'  THEN p.package_weight
        WHEN 'KG' THEN p.package_weight * 1000
        WHEN 'LB' THEN p.package_weight * 453.592
        WHEN 'OZ' THEN p.package_weight * 28.3495
     END)::numeric AS weight_g
  FROM public.products p
  JOIN public.measurement_units mu ON mu.id = p.package_weight_unit_id
  WHERE p.origin_country = 'India'
    AND p.package_weight IS NOT NULL
    AND mu.code IN ('G','KG','LB','OZ')
),
targets AS (
  SELECT
    pm.product_id,
    pm.price,
    pm.weight_g,
    CASE
      -- weight ≤ 200 g
      WHEN pm.weight_g <= 200 THEN
        CASE
          WHEN pm.price <= 300                  THEN 60
          WHEN pm.price BETWEEN 301  AND 500    THEN 45
          WHEN pm.price BETWEEN 501  AND 750    THEN 35
          WHEN pm.price BETWEEN 751  AND 1000   THEN 30
          WHEN pm.price BETWEEN 1001 AND 1500   THEN 25
          WHEN pm.price BETWEEN 1501 AND 2000   THEN 20
          WHEN pm.price BETWEEN 2001 AND 5000   THEN 15
          WHEN pm.price >  5000                 THEN 10
        END
      -- weight 201 – 450 g
      WHEN pm.weight_g <= 450 THEN
        CASE
          WHEN pm.price <= 300                  THEN 85
          WHEN pm.price BETWEEN 301  AND 500    THEN 65
          WHEN pm.price BETWEEN 501  AND 750    THEN 55
          WHEN pm.price BETWEEN 751  AND 1000   THEN 45
          WHEN pm.price BETWEEN 1001 AND 1500   THEN 35
          WHEN pm.price BETWEEN 1501 AND 2000   THEN 20
          WHEN pm.price BETWEEN 2001 AND 5000   THEN 10
          WHEN pm.price >  5000                 THEN 8
        END
      -- weight 451 – 750 g  (price ≤ 500 = flagged → NULL)
      WHEN pm.weight_g <= 750 THEN
        CASE
          WHEN pm.price BETWEEN 501  AND 750    THEN 85
          WHEN pm.price BETWEEN 751  AND 1000   THEN 60
          WHEN pm.price BETWEEN 1001 AND 1500   THEN 40
          WHEN pm.price BETWEEN 1501 AND 2000   THEN 30
          WHEN pm.price BETWEEN 2001 AND 5000   THEN 20
          WHEN pm.price >  5000                 THEN 10
          ELSE NULL
        END
      -- weight 751 – 1 000 g  (price ≤ 1 000 = flagged → NULL)
      WHEN pm.weight_g <= 1000 THEN
        CASE
          WHEN pm.price BETWEEN 1001 AND 2000   THEN 80
          WHEN pm.price BETWEEN 2001 AND 5000   THEN 40
          WHEN pm.price >  5000                 THEN 15
          ELSE NULL
        END
      -- weight 1 001 – 1 500 g  (price ≤ 2 000 = flagged → NULL)
      WHEN pm.weight_g <= 1500 THEN
        CASE
          WHEN pm.price BETWEEN 2001 AND 5000   THEN 40
          WHEN pm.price >  5000                 THEN 25
          ELSE NULL
        END
      -- weight 1 501 – 2 000 g  (price ≤ 2 500 = flagged → NULL)
      WHEN pm.weight_g <= 2000 THEN
        CASE
          WHEN pm.price BETWEEN 2501 AND 3000   THEN 40
          WHEN pm.price BETWEEN 3001 AND 5000   THEN 35
          WHEN pm.price >  5000                 THEN 20
          ELSE NULL
        END
      -- weight > 2 000 g (heavy default flat 20 %)
      ELSE 20
    END AS mk
  FROM product_meta pm
),
gb AS (
  SELECT id FROM public.countries WHERE iso2 = 'GB'
)
-- ----------------------------------------------------------------------------
-- 2) UPDATE existing pcsp rows where mk IS NOT NULL.
-- ----------------------------------------------------------------------------
, upd AS (
  UPDATE public.product_country_selling_prices pcsp
     SET markup_percent = t.mk,
         selling_price  = ROUND(t.price * (1 + t.mk / 100.0), 2),
         markup_mrp     = ROUND(t.price * (1 + t.mk / 100.0), 2),
         updated_at     = NOW()
    FROM targets t, gb
   WHERE pcsp.product_id = t.product_id
     AND pcsp.country_id = gb.id
     AND t.mk IS NOT NULL
  RETURNING 1
)
-- ----------------------------------------------------------------------------
-- 3) INSERT missing pcsp rows (backfill products that never got GB pricing).
-- ----------------------------------------------------------------------------
INSERT INTO public.product_country_selling_prices
  (product_id, country_id, markup_percent, selling_price, markup_mrp,
   created_at, updated_at)
SELECT t.product_id, gb.id, t.mk,
       ROUND(t.price * (1 + t.mk / 100.0), 2),
       ROUND(t.price * (1 + t.mk / 100.0), 2),
       NOW(), NOW()
FROM targets t
CROSS JOIN gb
WHERE t.mk IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.product_country_selling_prices pcsp
     WHERE pcsp.product_id = t.product_id
       AND pcsp.country_id = gb.id
  );

COMMIT;
