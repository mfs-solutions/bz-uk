-- Add ships_internationally boolean to products table.
-- When true, the product ships to ALL countries worldwide.
-- Replaces the per-country product_international_shipping table for serviceability checks.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ships_internationally boolean NOT NULL DEFAULT false;

-- Backfill: any product that has rows in product_international_shipping
-- had international shipping "enabled" by the seller.
UPDATE public.products
SET ships_internationally = true
WHERE id IN (
  SELECT DISTINCT product_id FROM public.product_international_shipping
);
