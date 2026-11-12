begin;

-- ============================================================
-- Add origin_zone column to international_shipping_rate_card
-- This makes the rate table a full 4-dimensional matrix:
-- rate = f(origin_zone × country × weight_slab × service_type)
-- Exactly like Delhivery's Rate Calculator.
-- ============================================================

alter table public.international_shipping_rate_card
  add column if not exists origin_zone varchar(5) not null default 'A';

-- Add comment
comment on column public.international_shipping_rate_card.origin_zone is
  'Origin shipping zone (A, B, C, D...) — determined by pickup pincode via shipping_origin_zones table';

-- Drop old indexes and recreate with origin_zone
drop index if exists idx_intl_rate_card_country_weight;
drop index if exists idx_intl_rate_card_country_code;

create index idx_intl_rate_card_full_lookup
  on public.international_shipping_rate_card (origin_zone, country_code, service_type, weight_min_kg, weight_max_kg)
  where is_active = true;

create index idx_intl_rate_card_zone_country
  on public.international_shipping_rate_card (origin_zone, country_id)
  where is_active = true;

-- Unique constraint: one rate per (zone, country, service, weight_slab)
alter table public.international_shipping_rate_card
  add constraint uq_rate_card_zone_country_service_weight
  unique (origin_zone, country_code, service_type, weight_min_kg, weight_max_kg);

-- ============================================================
-- Replace the lookup RPC to include origin_zone
-- ============================================================
create or replace function public.lookup_international_shipping_rate(
  p_country_code text,
  p_weight_kg numeric,
  p_service_type text default 'dlv_saver',
  p_origin_zone text default 'A'
)
returns table (
  id uuid,
  country_name text,
  service_type text,
  weight_min_kg numeric,
  weight_max_kg numeric,
  rate_inr numeric,
  currency text,
  origin_zone varchar
)
language sql
stable
security definer
as $$
  select
    r.id,
    r.country_name,
    r.service_type,
    r.weight_min_kg,
    r.weight_max_kg,
    r.rate_inr,
    r.currency,
    r.origin_zone
  from public.international_shipping_rate_card r
  where r.is_active = true
    and upper(trim(r.origin_zone)) = upper(trim(p_origin_zone))
    and upper(trim(r.country_code)) = upper(trim(p_country_code))
    and r.service_type = lower(trim(p_service_type))
    and p_weight_kg >= r.weight_min_kg
    and p_weight_kg < r.weight_max_kg
  order by r.weight_min_kg
  limit 1;
$$;

-- ============================================================
-- NEW: Full rate calculator RPC — takes origin pincode, returns
-- all service types with rates (exactly like Delhivery's UI)
-- ============================================================
create or replace function public.calculate_international_shipping_rate(
  p_origin_pincode text,
  p_country_code text,
  p_weight_kg numeric default 0.5
)
returns table (
  origin_zone varchar,
  zone_name text,
  country_name text,
  service_type text,
  weight_min_kg numeric,
  weight_max_kg numeric,
  rate_inr numeric,
  currency text
)
language sql
stable
security definer
as $$
  with resolved_zone as (
    select z.zone_code, z.zone_name
    from public.shipping_origin_zones z
    where z.is_active = true
      and p_origin_pincode >= z.pincode_start
      and p_origin_pincode <= z.pincode_end
    order by z.pincode_start
    limit 1
  )
  select
    rz.zone_code as origin_zone,
    rz.zone_name,
    r.country_name,
    r.service_type,
    r.weight_min_kg,
    r.weight_max_kg,
    r.rate_inr,
    r.currency
  from resolved_zone rz
  join public.international_shipping_rate_card r
    on upper(trim(r.origin_zone)) = upper(trim(rz.zone_code))
   and upper(trim(r.country_code)) = upper(trim(p_country_code))
   and r.is_active = true
   and p_weight_kg >= r.weight_min_kg
   and p_weight_kg < r.weight_max_kg
  order by r.service_type;
$$;

commit;
