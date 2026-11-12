-- Add internal cost-breakdown columns to orders (backend-only, never exposed to buyers).
-- actual_shipping_cost = Delhivery API rate (or DB fallback) BEFORE platform surcharge.
-- platform_shipping_margin = hidden operational surcharge (₹15 domestic / ₹105 international).
-- shipping_charge (existing) = actual_shipping_cost + platform_shipping_margin (unchanged).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS actual_shipping_cost   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS platform_shipping_margin NUMERIC(12,2) DEFAULT 0;
