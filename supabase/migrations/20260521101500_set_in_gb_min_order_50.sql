-- Set India -> UK (GB) checkout minimum order value to 50 INR.
-- Other India-origin routes remain at their current threshold.

BEGIN;

UPDATE public.checkout_min_order_rules
SET min_order_inr = 50,
    updated_at    = now()
WHERE origin_iso2 = 'IN'
  AND destination_iso2 = 'GB';

COMMIT;
