begin;

with india_origin_products as (
  select
    p.id,
    coalesce(nullif(p.default_selling_price, 0), p.price) as base_price,
    coalesce(p.mrp, nullif(p.default_selling_price, 0), p.price) as mrp_base
  from public.products p
  join public.countries c on c.id = p.origin_country_id
  where upper(regexp_replace(coalesce(c.country_name, ''), '\\s+', '', 'g')) in ('INDIA', 'IN', 'IND')
    and not exists (
      select 1
      from public.product_country_selling_prices cp
      where cp.product_id = p.id
    )
),
target_countries as (
  select id as country_id
  from public.countries
  where upper(coalesce(iso2, country_code, short_code, country_name)) in ('AL', 'CH', 'DE', 'FR', 'KE', 'MT', 'US', 'GB', 'IE')
)
insert into public.product_country_selling_prices (
  product_id,
  country_id,
  selling_price,
  markup_percent,
  markup_mrp
)
select
  p.id,
  t.country_id,
  round(p.base_price * 1.65, 2),
  65,
  round(p.mrp_base * 1.65, 2)
from india_origin_products p
cross join target_countries t
on conflict (product_id, country_id)
do update set
  selling_price = excluded.selling_price,
  markup_percent = excluded.markup_percent,
  markup_mrp = excluded.markup_mrp,
  updated_at = now();

commit;