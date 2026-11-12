BEGIN;

-- India domestic/international must route through Shiprocket only.
DELETE FROM public.shipping_provider_config
WHERE country_code = 'IN'
  AND provider = 'delhivery';

-- Defensive cleanup: India domestic should never be Shippo.
DELETE FROM public.shipping_provider_config
WHERE country_code = 'IN'
  AND provider = 'shippo'
  AND domestic = true;

INSERT INTO public.shipping_provider_config (
  country_code,
  country_name,
  provider,
  domestic,
  international,
  markup_domestic,
  markup_intl,
  markup_currency,
  active
)
VALUES (
  'IN',
  'India',
  'shiprocket',
  true,
  true,
  125.00,
  125.00,
  'INR',
  true
)
ON CONFLICT (country_code, provider)
DO UPDATE SET
  country_name = EXCLUDED.country_name,
  domestic = true,
  international = true,
  active = true,
  updated_at = now();

COMMIT;