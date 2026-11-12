-- ================================================================
-- Add origin_country and origin_country_id columns to products table
-- Allows storing which country the product ships from
-- ================================================================

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS origin_country text DEFAULT '',
  ADD COLUMN IF NOT EXISTS origin_country_id uuid REFERENCES countries(id);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_products_origin_country_id ON products(origin_country_id);
