begin;

-- ============================================================
-- International shipping rate card (India → international)
-- Admin-managed reference table sourced from Delhivery portal.
-- Sellers see suggested rates; checkout uses seller-configured
-- product_international_shipping charges (not this table).
-- ============================================================

create table if not exists public.international_shipping_rate_card (
  id uuid primary key default gen_random_uuid(),
  country_id uuid references public.countries(id) on delete cascade,
  country_name text not null,
  country_code varchar(3),
  service_type text not null check (service_type in ('dlv_saver', 'express', 'deferred_express', 'document')),
  weight_min_kg numeric(8,3) not null default 0,
  weight_max_kg numeric(8,3) not null default 0.5,
  rate_inr numeric(10,2) not null default 0,
  currency text not null default 'INR',
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weight_slab_valid check (weight_max_kg > weight_min_kg),
  constraint rate_positive check (rate_inr >= 0)
);

-- Index for fast lookup by country + weight + service
create index if not exists idx_intl_rate_card_country_weight
  on public.international_shipping_rate_card (country_id, service_type, weight_min_kg, weight_max_kg)
  where is_active = true;

create index if not exists idx_intl_rate_card_country_code
  on public.international_shipping_rate_card (country_code, service_type)
  where is_active = true;

-- Auto-update updated_at
create or replace function public.update_intl_rate_card_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_intl_rate_card_updated_at
  before update on public.international_shipping_rate_card
  for each row
  execute function public.update_intl_rate_card_updated_at();

-- RLS: admin full access, authenticated users read-only
alter table public.international_shipping_rate_card enable row level security;

create policy "Admin full access on international_shipping_rate_card"
  on public.international_shipping_rate_card
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

create policy "Authenticated read on international_shipping_rate_card"
  on public.international_shipping_rate_card
  for select
  using (auth.role() = 'authenticated' and is_active = true);

-- ============================================================
-- RPC: look up rate by country code, weight, and service type
-- ============================================================
create or replace function public.lookup_international_shipping_rate(
  p_country_code text,
  p_weight_kg numeric,
  p_service_type text default 'dlv_saver'
)
returns table (
  id uuid,
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
  select
    r.id,
    r.country_name,
    r.service_type,
    r.weight_min_kg,
    r.weight_max_kg,
    r.rate_inr,
    r.currency
  from public.international_shipping_rate_card r
  where r.is_active = true
    and upper(trim(r.country_code)) = upper(trim(p_country_code))
    and r.service_type = lower(trim(p_service_type))
    and p_weight_kg >= r.weight_min_kg
    and p_weight_kg < r.weight_max_kg
  order by r.weight_min_kg
  limit 1;
$$;

commit;
