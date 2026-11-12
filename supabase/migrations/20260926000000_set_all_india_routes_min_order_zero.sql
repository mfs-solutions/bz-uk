-- Set ALL India-origin route checkout minimum order values to INR 0 (no minimum).
-- Applied live on 2026-09-25 via Management API.
-- Routes affected: GB, US, FR, DE, CH, KE, AL, MT, IE
--
-- Notes:
-- 1. The original CHECK constraint only allowed min_order_inr > 0,
--    so it is relaxed to >= 0 to permit disabling a route via 0.
-- 2. Effect: the frontend (checkoutPricingService.ts) filters rules to
--    minimumInr > 0, and the trigger enforce_checkout_min_order_value()
--    only enforces rules with min_order_inr > 0, so a 0 value means
--    NO minimum order requirement for these routes.
-- 3. To re-enable a route later, e.g. India -> UK at INR 2150:
--    UPDATE public.checkout_min_order_rules
--    SET min_order_inr = 2150, updated_at = now()
--    WHERE origin_iso2 = 'IN' AND destination_iso2 = 'GB';

ALTER TABLE public.checkout_min_order_rules
  DROP CONSTRAINT IF EXISTS checkout_min_order_rules_min_order_inr_check;

ALTER TABLE public.checkout_min_order_rules
  ADD CONSTRAINT checkout_min_order_rules_min_order_inr_check
  CHECK (min_order_inr >= 0);

UPDATE public.checkout_min_order_rules
SET min_order_inr = 0,
    is_active = true,
    updated_at = now()
WHERE origin_iso2 = 'IN';
