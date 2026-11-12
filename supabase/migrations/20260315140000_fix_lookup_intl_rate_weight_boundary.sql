-- Fix lookup_intl_rate: weight boundary should use <= for weight_max_kg
-- so that exactly 30KG (or any boundary value) is included in the matching slab
create or replace function public.lookup_intl_rate(
  p_country_code text,
  p_weight_kg numeric,
  p_service_type text default 'dlv_saver'
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
    and p_weight_kg >= r.weight_min_kg
    and p_weight_kg <= r.weight_max_kg
  order by r.rate_inr asc
  limit 1;
$$;
