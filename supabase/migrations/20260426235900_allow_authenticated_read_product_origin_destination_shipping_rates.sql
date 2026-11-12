begin;

alter table public.product_origin_destination_shipping_rates enable row level security;

drop policy if exists "Authenticated read on product_origin_destination_shipping_rates"
  on public.product_origin_destination_shipping_rates;

create policy "Authenticated read on product_origin_destination_shipping_rates"
  on public.product_origin_destination_shipping_rates
  for select
  to authenticated
  using (true);

commit;
