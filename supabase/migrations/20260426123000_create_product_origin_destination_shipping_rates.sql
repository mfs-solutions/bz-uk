begin;

create table if not exists public.product_origin_destination_shipping_rates (
  id bigserial primary key,
  product_origin_country text not null,
  destination_country text not null,
  weight_band_kg text not null,
  standard_shipping_rate_inr numeric(10,2) not null,
  standard_est_delivery_date text not null,
  express_shipping_rate_inr numeric(10,2) not null,
  express_est_delivery_date text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_origin_destination_shipping_rates_unique
    unique (product_origin_country, destination_country, weight_band_kg)
);

create index if not exists idx_pod_shipping_rates_origin_destination
  on public.product_origin_destination_shipping_rates (product_origin_country, destination_country);

create index if not exists idx_pod_shipping_rates_weight_band
  on public.product_origin_destination_shipping_rates (weight_band_kg);

create or replace function public.update_product_origin_destination_shipping_rates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_product_origin_destination_shipping_rates_updated_at
  on public.product_origin_destination_shipping_rates;

create trigger trg_product_origin_destination_shipping_rates_updated_at
  before update on public.product_origin_destination_shipping_rates
  for each row
  execute function public.update_product_origin_destination_shipping_rates_updated_at();

alter table public.product_origin_destination_shipping_rates enable row level security;

drop policy if exists "Admin full access on product_origin_destination_shipping_rates"
  on public.product_origin_destination_shipping_rates;

create policy "Admin full access on product_origin_destination_shipping_rates"
  on public.product_origin_destination_shipping_rates
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

drop policy if exists "Service role full access on product_origin_destination_shipping_rates"
  on public.product_origin_destination_shipping_rates;

create policy "Service role full access on product_origin_destination_shipping_rates"
  on public.product_origin_destination_shipping_rates
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select, insert, update, delete
  on public.product_origin_destination_shipping_rates
  to authenticated;

commit;
