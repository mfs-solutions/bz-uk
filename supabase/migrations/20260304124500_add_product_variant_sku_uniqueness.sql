create unique index if not exists idx_product_variants_product_sku_unique
  on public.product_variants (product_id, lower(sku))
  where sku is not null and btrim(sku) <> '';
