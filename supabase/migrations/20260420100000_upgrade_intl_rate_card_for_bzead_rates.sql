begin;

-- ============================================================
-- Upgrade intl_rate_card for BZEAD's own rate card system
-- 1. Add 'standard' to service_type check constraint
-- 2. Add delivery_days_min / delivery_days_max columns
-- 3. Deactivate ALL old Delhivery data
-- 4. Create intl_shipping_country_config for per-country thresholds
-- 5. Rebuild lookup_intl_shipping_tiers RPC
-- ============================================================

-- ── 1. Drop and recreate service_type check constraint to allow 'standard' ──
alter table public.intl_rate_card drop constraint if exists intl_rate_card_service_type_check;
alter table public.intl_rate_card
  add constraint intl_rate_card_service_type_check
  check (service_type in ('standard', 'express', 'dlv_saver', 'deferred_express', 'document'));

-- ── 2. Add delivery day range columns ──
alter table public.intl_rate_card
  add column if not exists delivery_days_min integer not null default 8
  constraint intl_rate_delivery_days_min_positive check (delivery_days_min > 0);

alter table public.intl_rate_card
  add column if not exists delivery_days_max integer not null default 11
  constraint intl_rate_delivery_days_max_positive check (delivery_days_max > 0);

-- ── 3. Deactivate ALL old data ──
update public.intl_rate_card set is_active = false where is_active = true;

-- ── 4. Create per-country shipping config table ──
create table if not exists public.intl_shipping_country_config (
  id uuid primary key default gen_random_uuid(),
  country_code varchar(3) not null,
  country_name text not null,
  free_shipping_above_inr numeric(12,2) not null default 0,
  customs_threshold_inr numeric(12,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_intl_ship_config_country unique (country_code)
);

create index if not exists idx_intl_ship_config_country
  on public.intl_shipping_country_config (country_code) where is_active = true;

-- Auto-update updated_at
create or replace function public.update_intl_ship_config_ts()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_intl_ship_config_ts
  before update on public.intl_shipping_country_config
  for each row
  execute function public.update_intl_ship_config_ts();

-- RLS
alter table public.intl_shipping_country_config enable row level security;

create policy "Admin full access on intl_shipping_country_config"
  on public.intl_shipping_country_config
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

create policy "Service role access on intl_shipping_country_config"
  on public.intl_shipping_country_config
  for select
  using (true);

-- ── 5. Seed per-country config ──
insert into public.intl_shipping_country_config
  (country_code, country_name, free_shipping_above_inr, customs_threshold_inr)
values
  ('GBR', 'United Kingdom', 6000, 17600),
  ('DEU', 'Germany',        5500, 16000),
  ('USA', 'United States',  5000, 67000),
  ('FRA', 'France',         5000, 15000),
  ('ESP', 'Spain',          5000, 15000),
  ('ITA', 'Italy',          5000, 15000)
on conflict (country_code) do update set
  free_shipping_above_inr = excluded.free_shipping_above_inr,
  customs_threshold_inr = excluded.customs_threshold_inr,
  country_name = excluded.country_name,
  is_active = true;

-- ── 6. Insert BZEAD rate card for India → target countries ──
-- Weight bands: 0-1, 1-2, 2-3, 3-5, 5-10, 10-15, 15-20, 20-25, 25-30

-- UK Standard (8-11 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('GBR','United Kingdom','standard',  0,  1, 330, 8, 11, true),
  ('GBR','United Kingdom','standard',  1,  2, 440, 8, 11, true),
  ('GBR','United Kingdom','standard',  2,  3, 550, 8, 11, true),
  ('GBR','United Kingdom','standard',  3,  5, 660, 8, 11, true),
  ('GBR','United Kingdom','standard',  5, 10, 880, 8, 11, true),
  ('GBR','United Kingdom','standard', 10, 15,1100, 8, 11, true),
  ('GBR','United Kingdom','standard', 15, 20,1350, 8, 11, true),
  ('GBR','United Kingdom','standard', 20, 25,1650, 8, 11, true),
  ('GBR','United Kingdom','standard', 25, 30,2000, 8, 11, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- UK Express (4-7 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('GBR','United Kingdom','express',  0,  1,  990, 4, 7, true),
  ('GBR','United Kingdom','express',  1,  2, 1200, 4, 7, true),
  ('GBR','United Kingdom','express',  2,  3, 1450, 4, 7, true),
  ('GBR','United Kingdom','express',  3,  5, 1700, 4, 7, true),
  ('GBR','United Kingdom','express',  5, 10, 2100, 4, 7, true),
  ('GBR','United Kingdom','express', 10, 15, 2600, 4, 7, true),
  ('GBR','United Kingdom','express', 15, 20, 3100, 4, 7, true),
  ('GBR','United Kingdom','express', 20, 25, 3550, 4, 7, true),
  ('GBR','United Kingdom','express', 25, 30, 4000, 4, 7, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- Germany Standard (8-11 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('DEU','Germany','standard',  0,  1, 330, 8, 11, true),
  ('DEU','Germany','standard',  1,  2, 440, 8, 11, true),
  ('DEU','Germany','standard',  2,  3, 550, 8, 11, true),
  ('DEU','Germany','standard',  3,  5, 660, 8, 11, true),
  ('DEU','Germany','standard',  5, 10, 880, 8, 11, true),
  ('DEU','Germany','standard', 10, 15,1100, 8, 11, true),
  ('DEU','Germany','standard', 15, 20,1350, 8, 11, true),
  ('DEU','Germany','standard', 20, 25,1650, 8, 11, true),
  ('DEU','Germany','standard', 25, 30,2000, 8, 11, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- Germany Express (4-7 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('DEU','Germany','express',  0,  1,  650, 4, 7, true),
  ('DEU','Germany','express',  1,  2,  830, 4, 7, true),
  ('DEU','Germany','express',  2,  3, 1000, 4, 7, true),
  ('DEU','Germany','express',  3,  5, 1200, 4, 7, true),
  ('DEU','Germany','express',  5, 10, 1550, 4, 7, true),
  ('DEU','Germany','express', 10, 15, 1950, 4, 7, true),
  ('DEU','Germany','express', 15, 20, 2300, 4, 7, true),
  ('DEU','Germany','express', 20, 25, 2600, 4, 7, true),
  ('DEU','Germany','express', 25, 30, 2850, 4, 7, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- US Standard (8-11 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('USA','United States','standard',  0,  1, 330, 8, 11, true),
  ('USA','United States','standard',  1,  2, 440, 8, 11, true),
  ('USA','United States','standard',  2,  3, 550, 8, 11, true),
  ('USA','United States','standard',  3,  5, 660, 8, 11, true),
  ('USA','United States','standard',  5, 10, 880, 8, 11, true),
  ('USA','United States','standard', 10, 15,1100, 8, 11, true),
  ('USA','United States','standard', 15, 20,1350, 8, 11, true),
  ('USA','United States','standard', 20, 25,1650, 8, 11, true),
  ('USA','United States','standard', 25, 30,2000, 8, 11, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- US Express (4-7 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('USA','United States','express',  0,  1, 1100, 4, 7, true),
  ('USA','United States','express',  1,  2, 1400, 4, 7, true),
  ('USA','United States','express',  2,  3, 1700, 4, 7, true),
  ('USA','United States','express',  3,  5, 2000, 4, 7, true),
  ('USA','United States','express',  5, 10, 2500, 4, 7, true),
  ('USA','United States','express', 10, 15, 3100, 4, 7, true),
  ('USA','United States','express', 15, 20, 3500, 4, 7, true),
  ('USA','United States','express', 20, 25, 3900, 4, 7, true),
  ('USA','United States','express', 25, 30, 4300, 4, 7, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- France Standard (8-11 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('FRA','France','standard',  0,  1, 330, 8, 11, true),
  ('FRA','France','standard',  1,  2, 440, 8, 11, true),
  ('FRA','France','standard',  2,  3, 550, 8, 11, true),
  ('FRA','France','standard',  3,  5, 660, 8, 11, true),
  ('FRA','France','standard',  5, 10, 880, 8, 11, true),
  ('FRA','France','standard', 10, 15,1100, 8, 11, true),
  ('FRA','France','standard', 15, 20,1350, 8, 11, true),
  ('FRA','France','standard', 20, 25,1650, 8, 11, true),
  ('FRA','France','standard', 25, 30,2000, 8, 11, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- France Express (4-7 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('FRA','France','express',  0,  1, 1100, 4, 7, true),
  ('FRA','France','express',  1,  2, 1400, 4, 7, true),
  ('FRA','France','express',  2,  3, 1700, 4, 7, true),
  ('FRA','France','express',  3,  5, 2000, 4, 7, true),
  ('FRA','France','express',  5, 10, 2500, 4, 7, true),
  ('FRA','France','express', 10, 15, 3100, 4, 7, true),
  ('FRA','France','express', 15, 20, 3500, 4, 7, true),
  ('FRA','France','express', 20, 25, 3900, 4, 7, true),
  ('FRA','France','express', 25, 30, 4300, 4, 7, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- Spain Standard (8-11 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('ESP','Spain','standard',  0,  1, 330, 8, 11, true),
  ('ESP','Spain','standard',  1,  2, 440, 8, 11, true),
  ('ESP','Spain','standard',  2,  3, 550, 8, 11, true),
  ('ESP','Spain','standard',  3,  5, 660, 8, 11, true),
  ('ESP','Spain','standard',  5, 10, 880, 8, 11, true),
  ('ESP','Spain','standard', 10, 15,1100, 8, 11, true),
  ('ESP','Spain','standard', 15, 20,1350, 8, 11, true),
  ('ESP','Spain','standard', 20, 25,1650, 8, 11, true),
  ('ESP','Spain','standard', 25, 30,2000, 8, 11, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- Spain Express (4-7 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('ESP','Spain','express',  0,  1, 1100, 4, 7, true),
  ('ESP','Spain','express',  1,  2, 1400, 4, 7, true),
  ('ESP','Spain','express',  2,  3, 1700, 4, 7, true),
  ('ESP','Spain','express',  3,  5, 2000, 4, 7, true),
  ('ESP','Spain','express',  5, 10, 2500, 4, 7, true),
  ('ESP','Spain','express', 10, 15, 3100, 4, 7, true),
  ('ESP','Spain','express', 15, 20, 3500, 4, 7, true),
  ('ESP','Spain','express', 20, 25, 3900, 4, 7, true),
  ('ESP','Spain','express', 25, 30, 4300, 4, 7, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- Italy Standard (8-11 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('ITA','Italy','standard',  0,  1, 330, 8, 11, true),
  ('ITA','Italy','standard',  1,  2, 440, 8, 11, true),
  ('ITA','Italy','standard',  2,  3, 550, 8, 11, true),
  ('ITA','Italy','standard',  3,  5, 660, 8, 11, true),
  ('ITA','Italy','standard',  5, 10, 880, 8, 11, true),
  ('ITA','Italy','standard', 10, 15,1100, 8, 11, true),
  ('ITA','Italy','standard', 15, 20,1350, 8, 11, true),
  ('ITA','Italy','standard', 20, 25,1650, 8, 11, true),
  ('ITA','Italy','standard', 25, 30,2000, 8, 11, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- Italy Express (4-7 days)
insert into public.intl_rate_card
  (country_code, country_name, service_type, weight_min_kg, weight_max_kg, rate_inr, delivery_days_min, delivery_days_max, is_active)
values
  ('ITA','Italy','express',  0,  1, 1100, 4, 7, true),
  ('ITA','Italy','express',  1,  2, 1400, 4, 7, true),
  ('ITA','Italy','express',  2,  3, 1700, 4, 7, true),
  ('ITA','Italy','express',  3,  5, 2000, 4, 7, true),
  ('ITA','Italy','express',  5, 10, 2500, 4, 7, true),
  ('ITA','Italy','express', 10, 15, 3100, 4, 7, true),
  ('ITA','Italy','express', 15, 20, 3500, 4, 7, true),
  ('ITA','Italy','express', 20, 25, 3900, 4, 7, true),
  ('ITA','Italy','express', 25, 30, 4300, 4, 7, true)
on conflict (country_code, service_type, weight_min_kg, weight_max_kg) do update set
  rate_inr = excluded.rate_inr,
  delivery_days_min = excluded.delivery_days_min,
  delivery_days_max = excluded.delivery_days_max,
  is_active = true;

-- ── 7. Create RPC to fetch tiers for a country + weight ──
-- Returns standard and express tiers (if available) for a given country/weight.
-- The edge function calls this instead of Shiprocket for rate-card countries.
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
    and p_weight_kg >= r.weight_min_kg
    and p_weight_kg <= r.weight_max_kg
  order by r.service_type asc;
$$;

commit;
