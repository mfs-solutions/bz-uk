-- =============================================================================
-- 1) products.stock <- SUM(product_variants.stock)
--    Keeps the legacy products.stock column in sync with the per-variant rows
--    so storefront cards never show "out of stock" while variants have stock.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_product_stock_from_variants()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id uuid := COALESCE(NEW.product_id, OLD.product_id);
  v_total int;
BEGIN
  IF v_product_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(GREATEST(stock, 0)), 0)::int
    INTO v_total
    FROM public.product_variants
   WHERE product_id = v_product_id;

  UPDATE public.products
     SET stock = v_total,
         updated_at = now()
   WHERE id = v_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_product_stock_ins ON public.product_variants;
DROP TRIGGER IF EXISTS trg_sync_product_stock_upd ON public.product_variants;
DROP TRIGGER IF EXISTS trg_sync_product_stock_del ON public.product_variants;

CREATE TRIGGER trg_sync_product_stock_ins
AFTER INSERT ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_from_variants();

CREATE TRIGGER trg_sync_product_stock_upd
AFTER UPDATE OF stock, product_id ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_from_variants();

CREATE TRIGGER trg_sync_product_stock_del
AFTER DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock_from_variants();

-- Backfill: align any drifted products with their variant totals
UPDATE public.products p
SET stock = sub.total
FROM (
  SELECT product_id, COALESCE(SUM(GREATEST(stock, 0)), 0)::int AS total
  FROM public.product_variants
  GROUP BY product_id
) sub
WHERE sub.product_id = p.id
  AND COALESCE(p.stock, 0) <> sub.total;


-- =============================================================================
-- 2) product_country_selling_prices: replace partial unique indexes with a
--    single composite unique using NULLS NOT DISTINCT, so Supabase
--    .upsert({ onConflict: 'product_id,country_id,variant_id' }) works for
--    both product-level (variant_id IS NULL) and per-variant rows.
-- =============================================================================

DROP INDEX IF EXISTS public.uniq_pcsp_product_country_no_variant;
DROP INDEX IF EXISTS public.uniq_pcsp_product_country_variant;

CREATE UNIQUE INDEX uniq_pcsp_product_country_variant
  ON public.product_country_selling_prices (product_id, country_id, variant_id)
  NULLS NOT DISTINCT;
