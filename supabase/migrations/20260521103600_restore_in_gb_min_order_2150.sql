-- Restore India -> UK (GB) checkout minimum order value to 2150 INR.

BEGIN;

UPDATE public.checkout_min_order_rules
SET min_order_inr = 2150,
    updated_at    = now()
WHERE origin_iso2 = 'IN'
  AND destination_iso2 = 'GB';

COMMIT;
