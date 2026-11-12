-- Back-fill markup_percent and markup_mrp for all existing rows
-- where markup_percent IS NULL (i.e. rows created before these columns existed).
--
-- markup_percent = ((selling_price - default_selling_price) / default_selling_price) * 100
--   rounded to 4 decimal places.
--
-- markup_mrp = products.mrp * (1 + markup_percent / 100)
--   rounded to 2 decimal places.
--
-- Rows where default_selling_price = 0 are skipped (would be division by zero).

UPDATE public.product_country_selling_prices pcsp
SET
  markup_percent = ROUND(
    ((pcsp.selling_price - p.default_selling_price) / p.default_selling_price) * 100,
    4
  ),
  markup_mrp = ROUND(
    p.mrp * (1 + ((pcsp.selling_price - p.default_selling_price) / p.default_selling_price)),
    2
  )
FROM public.products p
WHERE
  pcsp.product_id = p.id
  AND pcsp.markup_percent IS NULL
  AND p.default_selling_price > 0;
