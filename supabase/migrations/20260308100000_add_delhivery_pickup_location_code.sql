begin;

alter table public.seller_delhivery_accounts
  add column if not exists pickup_location_code text not null default 'DEFAULT_WH';

alter table public.product_delhivery_shipping
  add column if not exists pickup_location_code text not null default 'DEFAULT_WH';

update public.seller_delhivery_accounts
set pickup_location_code = upper(regexp_replace(coalesce(nullif(trim(account_code), ''), 'DEFAULT_WH'), '[^A-Za-z0-9_]+', '_', 'g'))
where coalesce(trim(pickup_location_code), '') = ''
  or upper(trim(pickup_location_code)) = 'DEFAULT_WH';

update public.product_delhivery_shipping p
set pickup_location_code = s.pickup_location_code
from public.seller_delhivery_accounts s
where p.seller_id = s.seller_id
  and (
    coalesce(trim(p.pickup_location_code), '') = ''
    or upper(trim(p.pickup_location_code)) = 'DEFAULT_WH'
  );

update public.product_delhivery_shipping
set pickup_location_code = 'DEFAULT_WH'
where coalesce(trim(pickup_location_code), '') = '';

create index if not exists idx_seller_delhivery_accounts_pickup_location_code
  on public.seller_delhivery_accounts (pickup_location_code);

create index if not exists idx_product_delhivery_shipping_pickup_location_code
  on public.product_delhivery_shipping (pickup_location_code);

commit;
