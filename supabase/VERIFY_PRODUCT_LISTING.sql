-- VERIFY_PRODUCT_LISTING.sql
-- Run in Supabase SQL Editor after creating one test product from Seller Product Listing.
-- Option A (recommended): Replace PRODUCT_ID below with a specific product UUID.
-- Option B: Leave placeholder as-is and script will auto-pick latest product by created_at.

with params as (
  select coalesce(
    nullif('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000')::uuid,
    (select p.id from public.products p order by p.created_at desc limit 1)
  ) as product_id
),

checks as (
  -- Migration / schema checks
  select
    'Schema: product_input_snapshots table exists' as check_name,
    case when to_regclass('public.product_input_snapshots') is not null then 'PASS' else 'FAIL' end as status,
    coalesce(to_regclass('public.product_input_snapshots')::text, 'missing') as details

  union all
  select
    'Schema: product_domestic_shipping.expected_delivery_days exists',
    case when exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'product_domestic_shipping'
        and column_name = 'expected_delivery_days'
    ) then 'PASS' else 'FAIL' end,
    'column check'

  -- Fetch/source table readiness checks
  union all
  select
    'Fetch table: categories has data',
    case when exists (select 1 from public.categories limit 1) then 'PASS' else 'FAIL' end,
    'required by Basic Info'

  union all
  select
    'Fetch table: countries has data',
    case when exists (select 1 from public.countries where is_active = true limit 1) then 'PASS' else 'FAIL' end,
    'required by Basic/International Shipping'

  union all
  select
    'Fetch table: domestic_courier_type has data',
    case when exists (select 1 from public.domestic_courier_type limit 1) then 'PASS' else 'FAIL' end,
    'required by Domestic Shipping'

  union all
  select
    'Fetch table: domestic_shippingcharge_type has data',
    case when exists (select 1 from public.domestic_shippingcharge_type limit 1) then 'PASS' else 'FAIL' end,
    'required by Domestic Shipping'

  union all
  select
    'Fetch table: international_courier_type has data',
    case when exists (select 1 from public.international_courier_type limit 1) then 'PASS' else 'FAIL' end,
    'required by International Shipping'

  union all
  select
    'Save: products row exists',
    case when exists (
      select 1 from public.products p join params x on p.id = x.product_id
    ) then 'PASS' else 'FAIL' end,
    'core product row'

  union all
  select
    'Save: product_variants rows exist',
    case when exists (
      select 1 from public.product_variants v join params x on v.product_id = x.product_id
    ) then 'PASS' else 'WARN' end,
    'optional if no variants entered'

  union all
  select
    'Save: offer_rules rows exist',
    case when exists (
      select 1 from public.offer_rules o join params x on o.product_id = x.product_id
    ) then 'PASS' else 'WARN' end,
    'optional if no offers entered'

  union all
  select
    'Save: product_domestic_shipping row exists',
    case when exists (
      select 1 from public.product_domestic_shipping d join params x on d.product_id = x.product_id
    ) then 'PASS' else 'WARN' end,
    'optional if domestic section left blank'

  union all
  select
    'Save: product_domestic_state_charges rows exist',
    case when exists (
      select 1 from public.product_domestic_state_charges ds join params x on ds.product_id = x.product_id
    ) then 'PASS' else 'WARN' end,
    'only for state-wise shipping type'

  union all
  select
    'Save: product_international_shipping rows exist',
    case when exists (
      select 1 from public.product_international_shipping i join params x on i.product_id = x.product_id
    ) then 'PASS' else 'WARN' end,
    'only if international shipping enabled'

  union all
  select
    'Save: product_input_snapshots row exists',
    case when exists (
      select 1 from public.product_input_snapshots s join params x on s.product_id = x.product_id
    ) then 'PASS' else 'FAIL' end,
    'no-loss full input snapshot'

  -- Snapshot completeness checks
  union all
  select
    'Snapshot: basic_info object saved',
    case when exists (
      select 1
      from public.product_input_snapshots s
      join params x on s.product_id = x.product_id
      where jsonb_typeof(s.basic_info) = 'object'
        and s.basic_info <> '{}'::jsonb
    ) then 'PASS' else 'FAIL' end,
    'required'

  union all
  select
    'Snapshot: media object saved',
    case when exists (
      select 1
      from public.product_input_snapshots s
      join params x on s.product_id = x.product_id
      where jsonb_typeof(s.media) = 'object'
        and s.media <> '{}'::jsonb
    ) then 'PASS' else 'FAIL' end,
    'required'

  union all
  select
    'Snapshot: product_details object saved',
    case when exists (
      select 1
      from public.product_input_snapshots s
      join params x on s.product_id = x.product_id
      where jsonb_typeof(s.product_details) = 'object'
    ) then 'PASS' else 'FAIL' end,
    'required'

  union all
  select
    'Snapshot: domestic_shipping object saved',
    case when exists (
      select 1
      from public.product_input_snapshots s
      join params x on s.product_id = x.product_id
      where jsonb_typeof(s.domestic_shipping) = 'object'
    ) then 'PASS' else 'FAIL' end,
    'required'

  union all
  select
    'Snapshot: international_shipping object saved',
    case when exists (
      select 1
      from public.product_input_snapshots s
      join params x on s.product_id = x.product_id
      where jsonb_typeof(s.international_shipping) = 'object'
    ) then 'PASS' else 'FAIL' end,
    'required'

  union all
  select
    'Snapshot: offers object saved',
    case when exists (
      select 1
      from public.product_input_snapshots s
      join params x on s.product_id = x.product_id
      where jsonb_typeof(s.offers) = 'object'
    ) then 'PASS' else 'FAIL' end,
    'required'

  union all
  select
    'Snapshot: selected product id exists',
    case when exists (
      select 1
      from params x
      where x.product_id is not null
    ) then 'PASS' else 'WARN' end,
    'using provided UUID or auto-selected latest product'
)

select *
from checks
order by
  case status when 'FAIL' then 1 when 'WARN' then 2 else 3 end,
  check_name;

-- Optional helper: get latest product id for a seller
-- select id, seller_id, name, created_at
-- from public.products
-- where seller_id = 'PUT_SELLER_UUID_HERE'::uuid
-- order by created_at desc
-- limit 5;
