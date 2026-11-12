-- Gap-free India → UK POD shipping bands (0–5 kg standard = INR 0).
-- Matches checkout band logic: weight >= FROM AND weight < TO.

begin;

update public.product_origin_destination_shipping_rates
set weight_band_from = 0, weight_band_to = 0.6,
    standard_shipping_amount = 0, express_shipping_amount = 2400,
    standard_est_delivery_date = '11-15 DAYS', express_est_delivery_date = '2-6 DAYS',
    updated_at = now()
where id = 1
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

update public.product_origin_destination_shipping_rates
set weight_band_from = 0.6, weight_band_to = 1.0,
    standard_shipping_amount = 0, express_shipping_amount = 2900,
    standard_est_delivery_date = '11-15 DAYS', express_est_delivery_date = '2-6 DAYS',
    updated_at = now()
where id = 2
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

update public.product_origin_destination_shipping_rates
set weight_band_from = 1.0, weight_band_to = 1.6,
    standard_shipping_amount = 0, express_shipping_amount = 3300,
    standard_est_delivery_date = '11-15 DAYS', express_est_delivery_date = '2-6 DAYS',
    updated_at = now()
where id = 3
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

update public.product_origin_destination_shipping_rates
set weight_band_from = 1.6, weight_band_to = 2.1,
    standard_shipping_amount = 0, express_shipping_amount = 3600,
    standard_est_delivery_date = '11-15 DAYS', express_est_delivery_date = '2-6 DAYS',
    updated_at = now()
where id = 4
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

update public.product_origin_destination_shipping_rates
set weight_band_from = 2.1, weight_band_to = 3.1,
    standard_shipping_amount = 0, express_shipping_amount = 3999,
    standard_est_delivery_date = '11-15 DAYS', express_est_delivery_date = '2-6 DAYS',
    updated_at = now()
where id = 5
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

update public.product_origin_destination_shipping_rates
set weight_band_from = 3.1, weight_band_to = 4.1,
    standard_shipping_amount = 0, express_shipping_amount = 4200,
    standard_est_delivery_date = '11-15 DAYS', express_est_delivery_date = '2-6 DAYS',
    updated_at = now()
where id = 6
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

update public.product_origin_destination_shipping_rates
set weight_band_from = 4.1, weight_band_to = 5.001,
    standard_shipping_amount = 0, express_shipping_amount = 4450,
    standard_est_delivery_date = '11-15 DAYS', express_est_delivery_date = '4-6 DAYS',
    updated_at = now()
where id = 7
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

-- Paid band above 5 kg: start at 5.001 so 5.0 kg stays on free row 7.
update public.product_origin_destination_shipping_rates
set weight_band_from = 5.001,
    updated_at = now()
where id = 8
  and product_origin_country_id = (select id from public.countries where iso2 = 'IN')
  and destination_country_id = (select id from public.countries where iso2 = 'GB');

commit;
