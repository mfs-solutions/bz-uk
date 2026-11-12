-- Set minimum order value to INR 2150 for all India-origin routes
-- Applies to: Albania, Switzerland, Germany, France, Kenya, Malta, United States, Ireland
-- (UK/GB was already set to 2150 in a previous migration)

UPDATE public.checkout_min_order_rules
SET
  min_order_inr = 2150,
  updated_at    = now()
WHERE origin_iso2      = 'IN'
  AND destination_iso2 IN ('AL', 'CH', 'DE', 'FR', 'KE', 'MT', 'US', 'IE');
