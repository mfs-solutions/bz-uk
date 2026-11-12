-- Drop the legacy delivery_countries table entirely.
-- All shipping is now handled by Shiprocket (India) and Shippo (UK/non-India) live rates.
-- International per-product config uses product_international_shipping table instead.

drop table if exists public.delivery_countries cascade;
