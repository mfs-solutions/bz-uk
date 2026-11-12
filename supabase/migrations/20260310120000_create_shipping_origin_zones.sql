begin;

-- ============================================================
-- Shipping Origin Zones
-- Maps Indian origin pincodes to shipping zones (A, B, C, D, etc.)
-- Delhivery uses origin zones to determine international shipping rates.
-- Rate = f(origin_zone × destination_country × weight_slab × service_type)
-- ============================================================

create table if not exists public.shipping_origin_zones (
  id uuid primary key default gen_random_uuid(),
  zone_code varchar(5) not null,               -- A, B, C, D, etc.
  zone_name text not null,                      -- "Metro", "Tier-2", etc.
  pincode_start varchar(10) not null,           -- range start (inclusive)
  pincode_end   varchar(10) not null,           -- range end   (inclusive)
  city          text,                           -- optional city name
  state         text,                           -- optional state name
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint zone_pincode_range_valid check (pincode_end >= pincode_start)
);

-- Fast lookup by pincode
create index if not exists idx_origin_zones_pincode_range
  on public.shipping_origin_zones (pincode_start, pincode_end)
  where is_active = true;

create index if not exists idx_origin_zones_zone_code
  on public.shipping_origin_zones (zone_code)
  where is_active = true;

-- Auto-update updated_at
create or replace function public.update_origin_zones_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_origin_zones_updated_at
  before update on public.shipping_origin_zones
  for each row
  execute function public.update_origin_zones_updated_at();

-- RLS: admin full access, authenticated read-only
alter table public.shipping_origin_zones enable row level security;

create policy "Admin full access on shipping_origin_zones"
  on public.shipping_origin_zones
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

create policy "Authenticated read on shipping_origin_zones"
  on public.shipping_origin_zones
  for select
  using (auth.role() = 'authenticated' and is_active = true);

-- ============================================================
-- RPC: Resolve origin pincode to zone code
-- ============================================================
create or replace function public.resolve_origin_zone(p_pincode text)
returns text
language sql
stable
security definer
as $$
  select z.zone_code
  from public.shipping_origin_zones z
  where z.is_active = true
    and p_pincode >= z.pincode_start
    and p_pincode <= z.pincode_end
  order by z.pincode_start
  limit 1;
$$;

commit;
