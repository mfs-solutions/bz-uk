-- Drop the shiprocket_intl_pickup table.
-- Pickup locations are now managed exclusively via seller_pickup_locations
-- (written during seller warehouse onboarding at /seller/warehouse).

DROP TABLE IF EXISTS public.shiprocket_intl_pickup CASCADE;
