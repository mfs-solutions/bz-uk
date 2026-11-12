begin;

-- Raise the UK free-shipping threshold from ₹7,050 to ₹12,500.
--
-- This value is read at runtime by the shiprocket-rate edge function via
-- lookup_intl_shipping_tiers → intl_shipping_country_config.free_shipping_above_inr
-- and returned as freeShippingAboveInr in the rate response.
-- checkoutPricingService.ts reads it and zeros out shipping when the
-- marked-up INR subtotal meets or exceeds this threshold.

update public.intl_shipping_country_config
set
  free_shipping_above_inr = 12500,
  updated_at              = now()
where country_code = 'GBR';

commit;
