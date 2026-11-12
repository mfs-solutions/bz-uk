begin;

-- ============================================================
-- Drop the old complex international rate card system
-- (zone × country × weight slab × service type) and replace
-- with a simple country × weight band rate table.
-- ============================================================

-- Drop old RPCs
drop function if exists public.calculate_international_shipping_rate(text, text, numeric);
drop function if exists public.lookup_international_shipping_rate(text, numeric, text, text);
drop function if exists public.lookup_international_shipping_rate(text, numeric, text);
drop function if exists public.resolve_origin_zone(text);

-- Drop old triggers
drop trigger if exists trg_intl_rate_card_updated_at on public.international_shipping_rate_card;
drop trigger if exists trg_origin_zones_updated_at on public.shipping_origin_zones;

-- Drop old tables (cascade removes indexes + policies)
drop table if exists public.international_shipping_rate_card cascade;
drop table if exists public.shipping_origin_zones cascade;

-- Drop old trigger functions
drop function if exists public.update_intl_rate_card_updated_at();
drop function if exists public.update_origin_zones_updated_at();

-- ============================================================
-- New simple international rate card
-- One row per (country, service_type, weight band)
-- Admin enters rates from Delhivery dashboard calculator.
-- ============================================================

create table if not exists public.intl_rate_card (
  id uuid primary key default gen_random_uuid(),
  country_code varchar(3) not null,
  country_name text not null,
  service_type text not null default 'dlv_saver'
    check (service_type in ('dlv_saver', 'express', 'deferred_express', 'document')),
  weight_min_kg numeric(8,3) not null default 0,
  weight_max_kg numeric(8,3) not null default 0.5,
  rate_inr numeric(10,2) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intl_rate_weight_valid check (weight_max_kg > weight_min_kg),
  constraint intl_rate_positive check (rate_inr >= 0),
  constraint uq_intl_rate unique (country_code, service_type, weight_min_kg, weight_max_kg)
);

-- Fast lookup index
create index idx_intl_rate_lookup
  on public.intl_rate_card (country_code, service_type, weight_min_kg, weight_max_kg)
  where is_active = true;

-- Auto-update updated_at
create or replace function public.update_intl_rate_card_ts()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_intl_rate_card_ts
  before update on public.intl_rate_card
  for each row
  execute function public.update_intl_rate_card_ts();

-- RLS
alter table public.intl_rate_card enable row level security;

create policy "Admin full access on intl_rate_card"
  on public.intl_rate_card
  for all
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "Authenticated read on intl_rate_card"
  on public.intl_rate_card
  for select
  using (auth.role() = 'authenticated' and is_active = true);

-- ============================================================
-- Simple RPC: look up cheapest rate by country + weight
-- Returns the rate for the matching weight band.
-- At checkout, caller computes chargeable weight as:
--   MAX(actual_weight_kg, L*W*H / 5000)
-- then calls this with that chargeable weight.
-- ============================================================
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
    and p_weight_kg < r.weight_max_kg
  order by r.rate_inr asc
  limit 1;
$$;

commit;
