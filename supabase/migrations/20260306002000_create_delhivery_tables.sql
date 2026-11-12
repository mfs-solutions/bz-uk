begin;

create table if not exists public.seller_delhivery_accounts (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  pickup_postal_code text not null default '',
  pickup_address_line_1 text not null default '',
  pickup_city text not null default '',
  pickup_state text not null default '',
  pickup_country text not null default 'India',
  account_code text not null default '',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_delhivery_shipping (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  pickup_postal_code text not null default '',
  use_live_rate boolean not null default true,
  fallback_shipping_charge numeric(12,2) not null default 0,
  fallback_delivery_days integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_delhivery_shipping_product_id_unique unique (product_id)
);

alter table public.product_delhivery_shipping
  add column if not exists pickup_postal_code text not null default '';

alter table public.product_delhivery_shipping
  add column if not exists use_live_rate boolean not null default true;

alter table public.product_delhivery_shipping
  add column if not exists fallback_shipping_charge numeric(12,2) not null default 0;

alter table public.product_delhivery_shipping
  add column if not exists fallback_delivery_days integer not null default 0;

alter table public.product_delhivery_shipping
  add column if not exists is_active boolean not null default true;

alter table public.product_delhivery_shipping
  add column if not exists created_at timestamptz not null default now();

alter table public.product_delhivery_shipping
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_product_delhivery_shipping_seller_id
  on public.product_delhivery_shipping (seller_id);

alter table public.seller_delhivery_accounts enable row level security;
alter table public.product_delhivery_shipping enable row level security;

grant select, insert, update, delete on table public.seller_delhivery_accounts to authenticated;
grant select, insert, update, delete on table public.product_delhivery_shipping to authenticated;

drop policy if exists seller_delhivery_accounts_select_own on public.seller_delhivery_accounts;
create policy seller_delhivery_accounts_select_own
  on public.seller_delhivery_accounts for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists seller_delhivery_accounts_insert_own on public.seller_delhivery_accounts;
create policy seller_delhivery_accounts_insert_own
  on public.seller_delhivery_accounts for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists seller_delhivery_accounts_update_own on public.seller_delhivery_accounts;
create policy seller_delhivery_accounts_update_own
  on public.seller_delhivery_accounts for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

drop policy if exists product_delhivery_shipping_select_own on public.product_delhivery_shipping;
create policy product_delhivery_shipping_select_own
  on public.product_delhivery_shipping for select to authenticated
  using (true);

drop policy if exists product_delhivery_shipping_insert_own on public.product_delhivery_shipping;
create policy product_delhivery_shipping_insert_own
  on public.product_delhivery_shipping for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists product_delhivery_shipping_update_own on public.product_delhivery_shipping;
create policy product_delhivery_shipping_update_own
  on public.product_delhivery_shipping for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

drop policy if exists seller_delhivery_accounts_admin_all on public.seller_delhivery_accounts;
create policy seller_delhivery_accounts_admin_all
  on public.seller_delhivery_accounts for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists product_delhivery_shipping_admin_all on public.product_delhivery_shipping;
create policy product_delhivery_shipping_admin_all
  on public.product_delhivery_shipping for all to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop trigger if exists seller_delhivery_accounts_updated_at on public.seller_delhivery_accounts;
create trigger seller_delhivery_accounts_updated_at
  before update on public.seller_delhivery_accounts
  for each row execute function public.update_updated_at_column();

drop trigger if exists product_delhivery_shipping_updated_at on public.product_delhivery_shipping;
create trigger product_delhivery_shipping_updated_at
  before update on public.product_delhivery_shipping
  for each row execute function public.update_updated_at_column();

-- Backfill current delhivery-tagged products into dedicated config table.
insert into public.product_delhivery_shipping (product_id, seller_id, pickup_postal_code, use_live_rate, fallback_shipping_charge, fallback_delivery_days, is_active)
select
  p.id,
  p.seller_id,
  '',
  true,
  0,
  0,
  true
from public.products p
where p.seller_id is not null
  and (
    lower(coalesce(p.shipping_type, '')) = 'delhivery'
    or lower(coalesce(p.courier_partner, '')) like '%delhivery%'
  )
on conflict (product_id) do nothing;

commit;
