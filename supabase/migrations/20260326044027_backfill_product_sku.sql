-- Backfill SKU for all products that have a public_product_id but no SKU set
UPDATE public.products
SET sku = public_product_id
WHERE (sku IS NULL OR btrim(sku) = '')
  AND public_product_id IS NOT NULL
  AND btrim(public_product_id) <> '';
