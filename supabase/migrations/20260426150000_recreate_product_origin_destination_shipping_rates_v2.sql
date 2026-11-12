begin;

-- Recreate shipping rates table with strict country wiring, weight units, ranges, and currency-aware amounts.
drop table if exists public.product_origin_destination_shipping_rates cascade;

drop function if exists public.update_product_origin_destination_shipping_rates_updated_at();

create table public.product_origin_destination_shipping_rates (
  id bigserial primary key,
  product_origin_country_id uuid not null references public.countries(id) on delete restrict,
  destination_country_id uuid not null references public.countries(id) on delete restrict,
  weight_band_unit text not null,
  weight_band_from numeric(12,3) not null,
  weight_band_to numeric(12,3) not null,
  currency_code varchar(3) not null,
  standard_shipping_amount numeric(12,2) not null,
  standard_est_delivery_date text not null,
  express_shipping_amount numeric(12,2) not null,
  express_est_delivery_date text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pod_shipping_rates_weight_unit_chk
    check (upper(weight_band_unit) in ('GM', 'KG', 'LB', 'OZ')),
  constraint pod_shipping_rates_weight_from_chk
    check (weight_band_from >= 0),
  constraint pod_shipping_rates_weight_to_chk
    check (weight_band_to > weight_band_from),
  constraint pod_shipping_rates_currency_chk
    check (currency_code = upper(currency_code) and length(trim(currency_code)) = 3),
  constraint pod_shipping_rates_standard_amount_chk
    check (standard_shipping_amount >= 0),
  constraint pod_shipping_rates_express_amount_chk
    check (express_shipping_amount >= 0),
  constraint pod_shipping_rates_standard_eta_chk
    check (length(trim(standard_est_delivery_date)) > 0),
  constraint pod_shipping_rates_express_eta_chk
    check (length(trim(express_est_delivery_date)) > 0),
  constraint product_origin_destination_shipping_rates_unique
    unique (
      product_origin_country_id,
      destination_country_id,
      weight_band_unit,
      weight_band_from,
      weight_band_to,
      currency_code
    )
);

create index idx_pod_shipping_rates_origin_destination
  on public.product_origin_destination_shipping_rates (product_origin_country_id, destination_country_id);

create index idx_pod_shipping_rates_weight_range
  on public.product_origin_destination_shipping_rates (weight_band_unit, weight_band_from, weight_band_to);

create index idx_pod_shipping_rates_currency
  on public.product_origin_destination_shipping_rates (currency_code);

create or replace function public.update_product_origin_destination_shipping_rates_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

grant usage, select
  on sequence public.product_origin_destination_shipping_rates_id_seq
  to authenticated;

commit;
