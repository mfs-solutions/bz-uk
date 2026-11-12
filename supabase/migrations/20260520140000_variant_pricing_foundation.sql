-- ============================================================
-- Migration: Variant-aware pricing foundation (Stage A — schema only)
-- Date: 2026-05-20
-- Description:
--   Lays the groundwork for per-variant country pricing & per-variant MRP.
--   This migration is BEHAVIOR-NEUTRAL: it only adds nullable columns,
--   backfills sensible defaults, and creates indexes. No RPCs are
--   modified, no existing rows are deleted, no per-variant
--   product_country_selling_prices rows are inserted yet. Stage C
--   (a later migration) will rewrite the pricing RPCs and expand the
--   196 multi-variant products' country price rows.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. product_variants.mrp
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS mrp numeric(12,2);

-- Backfill rule:
--  • Multi-variant products → variant.mrp = round(variant.price * 1.35, 2)
--  • Single-variant products → inherit products.mrp when sane (mrp >= price),
--                              else fall back to variant.price * 1.35
WITH variant_counts AS (
  SELECT product_id, count(*) AS vc
  FROM public.product_variants
  GROUP BY product_id
)
UPDATE public.product_variants v
SET mrp = round(v.price * 1.35, 2)
FROM variant_counts vc
WHERE v.product_id = vc.product_id
  AND vc.vc > 1
  AND v.mrp IS NULL
  AND v.price IS NOT NULL
  AND v.price > 0;

WITH variant_counts AS (
  SELECT product_id, count(*) AS vc
  FROM public.product_variants
  GROUP BY product_id
)
UPDATE public.product_variants v
SET mrp = round(
  COALESCE(
    CASE WHEN p.mrp IS NOT NULL AND p.mrp >= v.price THEN p.mrp END,
    v.price * 1.35
  ),
  2
)
FROM public.products p, variant_counts vc
WHERE v.product_id = p.id
  AND v.product_id = vc.product_id
  AND vc.vc = 1
  AND v.mrp IS NULL
  AND v.price IS NOT NULL
  AND v.price > 0;

-- ─────────────────────────────────────────────────────────────
-- 2. cart_items.selected_variant_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS selected_variant_id uuid
    REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cart_items_selected_variant_id
  ON public.cart_items(selected_variant_id);

-- Backfill from existing selected_variant_sku where possible
UPDATE public.cart_items ci
SET selected_variant_id = pv.id
FROM public.product_variants pv
WHERE ci.product_id = pv.product_id
  AND ci.selected_variant_sku IS NOT NULL
  AND length(trim(ci.selected_variant_sku)) > 0
  AND upper(trim(pv.sku)) = upper(trim(ci.selected_variant_sku))
  AND ci.selected_variant_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. order_items.variant_id
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS variant_id uuid
    REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_variant_id
  ON public.order_items(variant_id);

-- Backfill historical orders: resolve variant from variant_info.sku
UPDATE public.order_items oi
SET variant_id = pv.id
FROM public.product_variants pv
WHERE oi.product_id = pv.product_id
  AND oi.variant_info IS NOT NULL
  AND oi.variant_info ? 'sku'
  AND oi.variant_info->>'sku' IS NOT NULL
  AND length(trim(oi.variant_info->>'sku')) > 0
  AND upper(trim(pv.sku)) = upper(trim(oi.variant_info->>'sku'))
  AND oi.variant_id IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 4. product_country_selling_prices.variant_id
--    (column added; NO row expansion in this migration)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.product_country_selling_prices
  ADD COLUMN IF NOT EXISTS variant_id uuid
    REFERENCES public.product_variants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_pcsp_variant_id
  ON public.product_country_selling_prices(variant_id);

-- Replace the previous (product_id, country_id) uniqueness with two
-- partial unique indexes so a product can have one product-level row
-- AND multiple per-variant rows simultaneously.
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.product_country_selling_prices'::regclass
      AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.product_country_selling_prices DROP CONSTRAINT %I', rec.conname);
  END LOOP;
END $$;

-- Drop legacy plain unique indexes (if any were created outside a constraint)
DROP INDEX IF EXISTS public.uniq_pcsp_product_country;
DROP INDEX IF EXISTS public.product_country_selling_prices_product_id_country_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pcsp_product_country_variant
  ON public.product_country_selling_prices (product_id, country_id, variant_id)
  WHERE variant_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pcsp_product_country_no_variant
  ON public.product_country_selling_prices (product_id, country_id)
  WHERE variant_id IS NULL;

COMMIT;
