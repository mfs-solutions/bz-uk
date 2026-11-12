-- Add per-variant images and weight/dimensions columns to product_variants
-- These enable:
--   1. Per-variant images (e.g., different photos for each color)
--   2. Per-variant weight/dimensions (for accurate shipping cost per variant)

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS weight NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS weight_unit TEXT DEFAULT 'g',
  ADD COLUMN IF NOT EXISTS length NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS width NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS height NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS dimension_unit TEXT DEFAULT 'cm';
