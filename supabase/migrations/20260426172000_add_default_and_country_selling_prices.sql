begin;

alter table public.products
  add column if not exists default_selling_price numeric(12,2),
  add column if not exists default_selling_country_id uuid references public.countries(id) on delete set null;

update public.products
set default_selling_price = price
where default_selling_price is null;

update public.products
set default_selling_country_id = origin_country_id
where default_selling_country_id is null
  and origin_country_id is not null;

alter table public.products
  alter column default_selling_price set not null;

alter table public.products
  alter column default_selling_price set default 0;

alter table public.products
  add constraint products_default_selling_price_non_negative_chk
  check (default_selling_price >= 0);

create table if not exists public.product_country_selling_prices (
  id bigserial primary key,
  product_id uuid not null references public.products(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete restrict,
  selling_price numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_country_selling_prices_selling_price_non_negative_chk
    check (selling_price >= 0),
  constraint product_country_selling_prices_unique_product_country
    unique (product_id, country_id)
);

create index if not exists idx_product_country_selling_prices_product
  on public.product_country_selling_prices(product_id);

create index if not exists idx_product_country_selling_prices_country
  on public.product_country_selling_prices(country_id);

create or replace function public.update_product_country_selling_prices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_country_selling_prices_updated_at
  on public.product_country_selling_prices;

create trigger trg_product_country_selling_prices_updated_at
  before update on public.product_country_selling_prices
  for each row
  execute function public.update_product_country_selling_prices_updated_at();

alter table public.product_country_selling_prices enable row level security;

drop policy if exists "Anyone can read product_country_selling_prices"
  on public.product_country_selling_prices;

create policy "Anyone can read product_country_selling_prices"
  on public.product_country_selling_prices
  for select
  using (true);

drop policy if exists "Sellers manage own product_country_selling_prices"
  on public.product_country_selling_prices;

create policy "Sellers manage own product_country_selling_prices"
  on public.product_country_selling_prices
  for all
  using (
    exists (
      select 1
      from public.products
      where products.id = product_country_selling_prices.product_id
        and products.seller_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.products
      where products.id = product_country_selling_prices.product_id
        and products.seller_id = auth.uid()
    )
  );

drop policy if exists "Admins full access on product_country_selling_prices"
  on public.product_country_selling_prices;

create policy "Admins full access on product_country_selling_prices"
  on public.product_country_selling_prices
  for all
  using (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

grant select on public.product_country_selling_prices to anon;
grant select, insert, update, delete on public.product_country_selling_prices to authenticated;
grant usage, select on sequence public.product_country_selling_prices_id_seq to authenticated;

commit;
