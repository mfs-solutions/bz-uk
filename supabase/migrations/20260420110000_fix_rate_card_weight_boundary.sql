-- Fix weight boundary: use (min, max] convention so each weight falls in exactly one band
-- weight > weight_min_kg AND weight <= weight_max_kg
create or replace function public.lookup_intl_shipping_tiers(
  p_country_code text,
  p_weight_kg numeric
)
returns table(
  service_type text,
  rate_inr numeric,
  delivery_days_min integer,
  delivery_days_max integer,
  free_shipping_above_inr numeric,
  customs_threshold_inr numeric
)
language sql
stable
security definer
as $$
  select
    r.service_type,
    r.rate_inr,
    r.delivery_days_min,
    r.delivery_days_max,
    coalesce(c.free_shipping_above_inr, 0) as free_shipping_above_inr,
    coalesce(c.customs_threshold_inr, 0) as customs_threshold_inr
  from public.intl_rate_card r
  left join public.intl_shipping_country_config c
    on upper(trim(c.country_code)) = upper(trim(p_country_code))
    and c.is_active = true
  where r.is_active = true
    and upper(trim(r.country_code)) = upper(trim(p_country_code))
    and r.service_type in ('standard', 'express')
    and p_weight_kg > r.weight_min_kg
    and p_weight_kg <= r.weight_max_kg
  order by r.service_type asc;
$$;

-- Also fix the legacy lookup_intl_rate to use same convention
create or replace function public.lookup_intl_rate(
  p_country_code text,
  p_weight_kg numeric,
  p_service_type text default 'standard'
)
returns numeric
language sql
stable
security definer
as $$
  select r.rate_inr
  from public.intl_rate_card r
  where r.is_active = true
    and upper(trim(r.country_code)) = upper(trim(p_country_code))
    and r.service_type = lower(trim(p_service_type))
    and p_weight_kg > r.weight_min_kg
    and p_weight_kg <= r.weight_max_kg
  order by r.rate_inr asc
  limit 1;
$$;
