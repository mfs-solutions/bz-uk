begin;

-- Update UK (India -> UK) rates exactly as requested.
-- Weight bands follow existing convention: (min, max]

-- Deactivate existing UK standard/express rows first to avoid stale bands.
update public.intl_rate_card
set is_active = false
where upper(trim(country_code)) = 'GBR'
  and service_type in ('standard', 'express');

-- Upsert requested UK standard rates (8-11 days).
insert into public.intl_rate_card (
  country_code,
  country_name,
  service_type,
  weight_min_kg,
  weight_max_kg,
  rate_inr,
  delivery_days_min,
  delivery_days_max,
  is_active
)
values
  ('GBR', 'United Kingdom', 'standard',  0,  1,  459, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard',  1,  2,  859, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard',  2,  3, 1250, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard',  3,  5, 1660, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard',  5, 10, 2280, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard', 10, 15, 2750, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard', 15, 20, 3050, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard', 20, 25, 3650, 8, 11, true),
  ('GBR', 'United Kingdom', 'standard', 25, 30, 4200, 8, 11, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg)
do update set
  country_name = excluded.country_name,
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true,
  updated_at = now();

-- Upsert requested UK express rates (4-7 days).
insert into public.intl_rate_card (
  country_code,
  country_name,
  service_type,
  weight_min_kg,
  weight_max_kg,
  rate_inr,
  delivery_days_min,
  delivery_days_max,
  is_active
)
values
  ('GBR', 'United Kingdom', 'express',  0,  1, 1080, 4, 7, true),
  ('GBR', 'United Kingdom', 'express',  1,  2, 1580, 4, 7, true),
  ('GBR', 'United Kingdom', 'express',  2,  3, 2050, 4, 7, true),
  ('GBR', 'United Kingdom', 'express',  3,  5, 2680, 4, 7, true),
  ('GBR', 'United Kingdom', 'express',  5, 10, 3259, 4, 7, true),
  ('GBR', 'United Kingdom', 'express', 10, 15, 3850, 4, 7, true),
  ('GBR', 'United Kingdom', 'express', 15, 20, 4180, 4, 7, true),
  ('GBR', 'United Kingdom', 'express', 20, 25, 4690, 4, 7, true),
  ('GBR', 'United Kingdom', 'express', 25, 30, 5500, 4, 7, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg)
do update set
  country_name = excluded.country_name,
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true,
  updated_at = now();

-- Update UK shipping config thresholds.
insert into public.intl_shipping_country_config (
  country_code,
  country_name,
  free_shipping_above_inr,
  customs_threshold_inr,
  is_active
)
values ('GBR', 'United Kingdom', 7050, 17000, true)
on conflict (country_code)
do update set
  country_name = excluded.country_name,
  free_shipping_above_inr = excluded.free_shipping_above_inr,
  customs_threshold_inr = excluded.customs_threshold_inr,
  is_active = true,
  updated_at = now();

commit;