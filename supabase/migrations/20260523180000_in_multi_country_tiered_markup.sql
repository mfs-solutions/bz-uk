-- ============================================================================
-- 20260523180000_in_multi_country_tiered_markup.sql
--
-- Apply the same operator-approved IN-origin tiered markup matrix
-- (by package weight band × price band — see 20260523150000_in_gb_tiered_markup_by_weight.sql)
-- to six additional destinations:
--   • US  United States
--   • MT  Malta
--   • KE  Kenya
--   • FR  France
--   • IE  Ireland
--   • DE  Germany
--
-- IDEMPOTENT: re-running with identical catalogue produces no further changes.
-- A run-scoped backup table is created on first run only.
--
-- NOTE on rate-card divergence:
--   This migration uses the SAME % matrix as GB. DE/IE/MT ship costs are close
--   to GB; US/FR/KE rate cards are not yet in DB. If actual shipping later
--   diverges materially, run a follow-up per-country migration to retune mk.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) Backup current pcsp rows for every IN product touched (6 countries).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public._pcsp_backup_20260523_in_multi6 AS
SELECT pcsp.*, c.iso2 AS country_iso2, NOW() AS backed_up_at
FROM public.product_country_selling_prices pcsp
JOIN public.products p           ON p.id  = pcsp.product_id
JOIN public.measurement_units mu ON mu.id = p.package_weight_unit_id
JOIN public.countries c          ON c.id  = pcsp.country_id
WHERE p.origin_country = 'India'
  AND c.iso2 IN ('US','MT','KE','FR','IE','DE')
  AND p.package_weight IS NOT NULL
  AND mu.code IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 1) Compute target markup per IN product (matrix identical to GB migration).
-- ----------------------------------------------------------------------------
WITH product_meta AS (
  SELECT
    p.id AS product_id,
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
      WHEN pm.weight_g <= 1000 THEN
        CASE
          WHEN pm.price BETWEEN 1001 AND 2000   THEN 80
          WHEN pm.price BETWEEN 2001 AND 5000   THEN 40
          WHEN pm.price >  5000                 THEN 15
          ELSE NULL
        END
      WHEN pm.weight_g <= 1500 THEN
        CASE
          WHEN pm.price BETWEEN 2001 AND 5000   THEN 40
          WHEN pm.price >  5000                 THEN 25
          ELSE NULL
        END
      WHEN pm.weight_g <= 2000 THEN
        CASE
          WHEN pm.price BETWEEN 2501 AND 3000   THEN 40
          WHEN pm.price BETWEEN 3001 AND 5000   THEN 35
          WHEN pm.price >  5000                 THEN 20
          ELSE NULL
        END
      ELSE 20
    END AS mk
  FROM product_meta pm
),
dest AS (
  SELECT id AS country_id, iso2
  FROM public.countries
  WHERE iso2 IN ('US','MT','KE','FR','IE','DE')
),
-- 2) UPDATE existing pcsp rows across all 6 destinations.
upd AS (
  UPDATE public.product_country_selling_prices pcsp
     SET markup_percent = t.mk,
         selling_price  = ROUND(t.price * (1 + t.mk / 100.0), 2),
         markup_mrp     = ROUND(t.price * (1 + t.mk / 100.0), 2),
         updated_at     = NOW()
    FROM targets t, dest d
   WHERE pcsp.product_id = t.product_id
     AND pcsp.country_id = d.country_id
     AND t.mk IS NOT NULL
  RETURNING 1
)
-- 3) INSERT missing pcsp rows.
INSERT INTO public.product_country_selling_prices
  (product_id, country_id, markup_percent, selling_price, markup_mrp,
   created_at, updated_at)
SELECT t.product_id, d.country_id, t.mk,
       ROUND(t.price * (1 + t.mk / 100.0), 2),
       ROUND(t.price * (1 + t.mk / 100.0), 2),
       NOW(), NOW()
FROM targets t
CROSS JOIN dest d
WHERE t.mk IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
      FROM public.product_country_selling_prices pcsp
     WHERE pcsp.product_id = t.product_id
       AND pcsp.country_id = d.country_id
  );

COMMIT;
