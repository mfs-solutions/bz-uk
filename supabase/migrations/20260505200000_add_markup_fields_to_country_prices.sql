-- Add markup_percent and markup_mrp columns to product_country_selling_prices.
-- markup_percent: the admin-set markup % applied on top of the base selling price.
-- markup_mrp:     the Maximum Retail Price (MRP) displayed for this country.
-- Both are nullable; existing rows default to NULL.

ALTER TABLE public.product_country_selling_prices
  ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS markup_mrp     NUMERIC(20, 2);

-- Allow anon + authenticated to read/write the new columns (inherits existing RLS policies).
-- No additional grants needed — the columns are part of the existing table grant.
