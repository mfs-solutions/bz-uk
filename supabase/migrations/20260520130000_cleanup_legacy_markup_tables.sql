-- Auto-generated cleanup migration: drop legacy markup tables/functions,
-- and re-establish the current live definitions of critical pricing RPCs.
-- Generated 2026-05-20T16:46:39.251Z

BEGIN;

-- 1. Drop legacy markup tables/triggers (idempotent)
DROP FUNCTION IF EXISTS public.update_product_markup_rates_updated_at() CASCADE;
DROP TABLE IF EXISTS public.product_markup_rates CASCADE;
DROP TABLE IF EXISTS public.lightweight_markup_rules CASCADE;
DROP TABLE IF EXISTS public.uk_geo_markup_rules CASCADE;
DROP TABLE IF EXISTS public.geo_pricing_zones CASCADE;

-- 2. Re-establish current live definitions of critical pricing RPCs
-- (dumped from production DB to guarantee `supabase db reset` reproducibility
-- after deleting the historical migrations that originally defined them.)

-- ===== create_order_secure =====
-- ─────────────────────────────────────────────────────────────────────────────
-- SUPERSEDED — DO NOT RE-RUN THIS DEFINITION ON ITS OWN.
-- Canonical create_order_secure = 20260527120000_restore_server_fx_create_order_secure.sql
-- This older body does NOT derive FX correctly from countries.exchange_rate
-- (it predates server-side FX or defaults v_fx to 1), so applying it in isolation
-- silently mislabels foreign-currency order totals (the ORD-1779833529 FX bug).
-- In-order migration replay is safe; only a manual re-run of THIS file is dangerous.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_order_secure(p_user_id uuid, p_items jsonb, p_shipping_address jsonb DEFAULT NULL::jsonb, p_billing_address jsonb DEFAULT NULL::jsonb, p_phone text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_payment_intent_id text DEFAULT NULL::text, p_payment_method text DEFAULT 'card'::text, p_payment_status text DEFAULT 'pending'::text, p_order_status text DEFAULT 'pending'::text, p_currency text DEFAULT 'INR'::text, p_shipping_charge numeric DEFAULT 0, p_actual_shipping_cost numeric DEFAULT 0, p_platform_shipping_margin numeric DEFAULT 0, p_fx_rate numeric DEFAULT 1, p_idempotency_key text DEFAULT NULL::text, p_shipping_carrier text DEFAULT NULL::text, p_shipping_service_level text DEFAULT NULL::text, p_shipping_provider text DEFAULT NULL::text, p_shipping_rate_id text DEFAULT NULL::text, p_expected_delivery_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_expected_delivery_days integer DEFAULT NULL::integer, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_product_subtotal_inr     numeric := 0;
  v_product_subtotal         numeric := 0;
  v_platform_fee             numeric := 0;
  v_seller_earning           numeric := 0;
  v_total_amount             numeric := 0;
  v_platform_handling_charge numeric := 0;
  v_settlement_cycle         text;
  v_order_id                 uuid;
  v_order_number             text;
  v_seller_id                uuid;
  v_distinct_sellers         uuid[];
  v_fx                       numeric;
  v_commission_percent       numeric;
  v_commission_extra         numeric;
  v_safe_payment_status      text;
  v_existing_order           record;
  v_item                     jsonb;
  v_qty                      int;
  v_sku                      text;
  v_product_id               uuid;
  v_has_variants             boolean;
  v_zone_code                text;
  v_country_token            text;
  v_destination_country_id   uuid;
begin
  if auth.uid() is null or auth.uid() != p_user_id then
    raise exception 'Unauthorized: user mismatch';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Items array cannot be empty';
  end if;

  if p_idempotency_key is not null and trim(p_idempotency_key) != '' then
    select id, order_number, total_amount, product_subtotal, platform_fee,
           seller_earning, settlement_cycle, settlement_status, status,
           payment_status, currency, created_at
    into v_existing_order
    from orders
    where idempotency_key = trim(p_idempotency_key)
      and user_id = p_user_id;

    if v_existing_order is not null then
      return jsonb_build_object(
        'id',               v_existing_order.id,
        'order_number',     v_existing_order.order_number,
        'total_amount',     v_existing_order.total_amount,
        'product_subtotal', v_existing_order.product_subtotal,
        'platform_fee',     v_existing_order.platform_fee,
        'seller_earning',   v_existing_order.seller_earning,
        'settlement_cycle', v_existing_order.settlement_cycle,
        'settlement_status',v_existing_order.settlement_status,
        'status',           v_existing_order.status,
        'payment_status',   v_existing_order.payment_status,
        'currency',         v_existing_order.currency,
        'created_at',       v_existing_order.created_at,
        'idempotent',       true
      );
    end if;
  end if;

  v_safe_payment_status := case
    when lower(trim(coalesce(p_payment_status, 'pending'))) in ('paid', 'completed', 'succeeded')
      then 'pending'
    else lower(trim(coalesce(p_payment_status, 'pending')))
  end;

  v_fx := greatest(coalesce(p_fx_rate, 1), 0.000001);
  v_country_token := regexp_replace(upper(coalesce(p_country, '')), '\\s+', '', 'g');
  v_zone_code := case when v_country_token in ('GB', 'GBR', 'UK', 'UNITEDKINGDOM') then 'UK' else null end;

  select c.id
  into v_destination_country_id
  from public.countries c
  where c.is_active = true
    and (
      upper(regexp_replace(coalesce(c.country_name, ''), '\\s+', '', 'g')) = v_country_token
      or upper(regexp_replace(coalesce(c.country_code, ''), '\\s+', '', 'g')) = v_country_token
      or upper(regexp_replace(coalesce(c.short_code, ''), '\\s+', '', 'g')) = v_country_token
      or upper(regexp_replace(coalesce(c.iso2, ''), '\\s+', '', 'g')) = v_country_token
    )
  order by c.country_name
  limit 1;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::int;
    v_sku        := upper(trim(coalesce(v_item->'variant_info'->>'sku', '')));

    select (count(*) > 1) into v_has_variants
    from product_variants where product_id = v_product_id;

    if v_has_variants and v_sku != '' then
      if (select stock from product_variants where product_id = v_product_id and upper(trim(sku)) = v_sku limit 1) < v_qty then
        raise exception 'Insufficient stock for product % (variant: %)', v_product_id, v_sku;
      end if;
    else
      if (select stock from products where id = v_product_id) < v_qty then
        raise exception 'Insufficient stock for product %', v_product_id;
      end if;
    end if;
  end loop;

  select coalesce(sum(
    round(coalesce(gp.selling_price, priced.base_price) * priced.quantity, 2)
  ), 0)
  into v_product_subtotal_inr
  from (
    select
      p.id as product_id,
      (item->>'quantity')::int as quantity,
      case
        when (select count(*) from product_variants where product_id = p.id) > 1
          then coalesce(pv.price, p.price)
        else p.price
      end as base_price
    from jsonb_array_elements(p_items) item
    join products p on p.id = (item->>'product_id')::uuid
    left join product_variants pv
      on pv.product_id = p.id
      and pv.sku = upper(trim(coalesce(item->'variant_info'->>'sku', '')))
      and upper(trim(coalesce(item->'variant_info'->>'sku', ''))) <> ''
  ) priced
  left join lateral (
    select g.selling_price
    from public.get_public_product_prices_with_overrides(
      array[priced.product_id],
      p_country,
      jsonb_build_object(priced.product_id::text, priced.base_price)
    ) g
    limit 1
  ) gp on true;

  if v_product_subtotal_inr <= 0 then
    raise exception 'Invalid product subtotal: no valid products found';
  end if;

  v_product_subtotal := round(v_product_subtotal_inr * v_fx, 2);

  select
    coalesce(r.charge_percent, 9),
    coalesce(r.extra_charge, 0)
  into v_commission_percent, v_commission_extra
  from platform_commission_rules r
  where r.is_active = true
    and v_product_subtotal >= coalesce(r.from_price, 0)
    and (r.to_price is null or v_product_subtotal <= r.to_price)
    and (
      (r.zone_code is not null and r.zone_code = v_zone_code)
      or (r.zone_code is null and r.country_id is not null and r.country_id = v_destination_country_id)
      or (r.zone_code is null and r.country_id is null)
    )
  order by
    case when r.zone_code  is not null then 0 else 1 end,
    case when r.country_id is null     then 1 else 0 end,
    coalesce(r.from_price, 0) desc,
    r.created_at desc
  limit 1;

  if v_commission_percent is null then
    v_commission_percent := 9;
    v_commission_extra := 0;
  end if;

  v_platform_fee    := round(v_product_subtotal * v_commission_percent / 100, 2) + v_commission_extra;
  v_seller_earning  := round(v_product_subtotal - v_platform_fee, 2);

  v_platform_handling_charge := round(
    (v_product_subtotal + coalesce(p_shipping_charge, 0)) * v_commission_percent / 100, 2
  );
  v_total_amount := round(
    v_product_subtotal + coalesce(p_shipping_charge, 0) + v_platform_handling_charge, 2
  );

  if extract(day from now()) <= 15 then
    v_settlement_cycle := 'CYCLE_1';
  else
    v_settlement_cycle := 'CYCLE_2';
  end if;

  v_order_number := 'ORD-' || extract(epoch from now())::bigint || '-' || left(gen_random_uuid()::text, 8);

  select array_agg(distinct p.seller_id)
  into v_distinct_sellers
  from jsonb_array_elements(p_items) item
  join products p on p.id = (item->>'product_id')::uuid
  where p.seller_id is not null;

  if array_length(v_distinct_sellers, 1) = 1 then
    v_seller_id := v_distinct_sellers[1];
  else
    v_seller_id := null;
  end if;

  insert into orders (
    user_id, seller_id, status, payment_status,
    total_amount, currency, shipping_address, billing_address,
    phone, notes, order_number, payment_intent_id, payment_method,
    shipping_charge, actual_shipping_cost, platform_shipping_margin,
    product_subtotal, platform_fee, seller_earning,
    settlement_cycle, settlement_status, idempotency_key,
    shipping_carrier, shipping_service_level, shipping_provider,
    shipping_rate_id, expected_delivery_date, expected_delivery_days
  ) values (
    p_user_id, v_seller_id, p_order_status, v_safe_payment_status,
    v_total_amount, upper(trim(coalesce(p_currency, 'INR'))), p_shipping_address, p_billing_address,
    p_phone, p_notes, v_order_number, p_payment_intent_id, p_payment_method,
    coalesce(p_shipping_charge, 0), coalesce(p_actual_shipping_cost, 0), coalesce(p_platform_shipping_margin, 0),
    v_product_subtotal, v_platform_fee, v_seller_earning,
    v_settlement_cycle, 'pending',
    case when p_idempotency_key is not null and trim(p_idempotency_key) != ''
         then trim(p_idempotency_key) else null end,
    nullif(trim(coalesce(p_shipping_carrier, '')), ''),
    nullif(trim(coalesce(p_shipping_service_level, '')), ''),
    nullif(trim(coalesce(p_shipping_provider, '')), ''),
    nullif(trim(coalesce(p_shipping_rate_id, '')), ''),
    p_expected_delivery_date,
    p_expected_delivery_days
  )
  returning id into v_order_id;

  insert into order_items (
    order_id, product_id, product_name, product_image,
    quantity, price, seller_id, variant_info, seller_earning
  )
  select
    v_order_id,
    priced.product_id,
    coalesce(nullif(priced.item->>'product_name', ''), priced.product_name),
    coalesce(nullif(priced.item->>'product_image', ''), priced.image_url, ''),
    priced.quantity,
    round(coalesce(gp.selling_price, priced.base_price) * v_fx, 2),
    priced.seller_id,
    jsonb_build_object(
      'size',                   priced.item->'variant_info'->>'size',
      'color',                  priced.item->'variant_info'->>'color',
      'sku',                    coalesce(priced.item->'variant_info'->>'sku', priced.sku),
      'hsn_code',               coalesce(priced.item->'variant_info'->>'hsn_code', priced.hsn_code),
      'expected_delivery_days', null
    ),
    round(coalesce(gp.selling_price, priced.base_price) * v_fx * priced.quantity * (1 - v_commission_percent / 100), 2)
  from (
    select
      item,
      p.id as product_id,
      p.name as product_name,
      p.image_url,
      p.seller_id,
      p.sku,
      p.hsn_code,
      (item->>'quantity')::int as quantity,
      case
        when (select count(*) from product_variants where product_id = p.id) > 1
          then coalesce(pv.price, p.price)
        else p.price
      end as base_price
    from jsonb_array_elements(p_items) item
    join products p on p.id = (item->>'product_id')::uuid
    left join product_variants pv
      on pv.product_id = p.id
      and pv.sku = upper(trim(coalesce(item->'variant_info'->>'sku', '')))
      and upper(trim(coalesce(item->'variant_info'->>'sku', ''))) <> ''
  ) priced
  left join lateral (
    select g.selling_price
    from public.get_public_product_prices_with_overrides(
      array[priced.product_id],
      p_country,
      jsonb_build_object(priced.product_id::text, priced.base_price)
    ) g
    limit 1
  ) gp on true;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty        := (v_item->>'quantity')::int;
    v_sku        := upper(trim(coalesce(v_item->'variant_info'->>'sku', '')));

    select (count(*) > 1) into v_has_variants
    from product_variants where product_id = v_product_id;

    if v_has_variants and v_sku != '' then
      update product_variants
      set stock      = greatest(stock - v_qty, 0),
          quantity   = greatest(quantity - v_qty, 0),
          updated_at = now()
      where product_id = v_product_id
        and upper(trim(sku)) = v_sku;

      update products
      set stock      = (select coalesce(sum(stock), 0) from product_variants where product_id = v_product_id),
          updated_at = now()
      where id = v_product_id;
    else
      update products
      set stock      = greatest(stock - v_qty, 0),
          updated_at = now()
      where id = v_product_id;
    end if;
  end loop;

  return jsonb_build_object(
    'id',               v_order_id,
    'order_number',     v_order_number,
    'total_amount',     v_total_amount,
    'product_subtotal', v_product_subtotal,
    'platform_fee',     v_platform_fee,
    'seller_earning',   v_seller_earning,
    'settlement_cycle', v_settlement_cycle,
    'settlement_status','pending',
    'status',           p_order_status,
    'payment_status',   v_safe_payment_status,
    'currency',         upper(trim(coalesce(p_currency, 'INR'))),
    'created_at',       now()
  );
end;
$function$
;

-- ===== calculate_checkout_pricing =====
CREATE OR REPLACE FUNCTION public.calculate_checkout_pricing(p_items jsonb, p_country text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with
  normalized_country as (
    select upper(regexp_replace(coalesce(p_country, ''), '\\s+', '', 'g')) as country_token
  ),
  detected_zone as (
    select case
      when (select country_token from normalized_country) in ('GB', 'GBR', 'UK', 'UNITEDKINGDOM') then 'UK'
      else null
    end as zone_code
  ),
  destination_country as (
    select c.id
    from public.countries c
    cross join normalized_country nc
    where c.is_active = true
      and (
        upper(regexp_replace(coalesce(c.country_name, ''), '\\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.country_code, ''), '\\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.short_code, ''), '\\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.iso2, ''), '\\s+', '', 'g')) = nc.country_token
      )
    order by c.country_name
    limit 1
  ),
  requested as (
    select
      i.product_id,
      greatest(coalesce(i.quantity, 0), 0)::integer as quantity
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as i(product_id uuid, quantity integer)
    where i.product_id is not null
      and coalesce(i.quantity, 0) > 0
  ),
  product_rows as (
    select
      r.product_id,
      r.quantity,
      p.price,
      p.origin_country,
      p.origin_country_id
    from requested r
    join public.products p on p.id = r.product_id
  ),
  eligible_rows as (
    select
      pr.product_id,
      pr.quantity,
      pr.price,
      (
        exists (
          select 1 from destination_country dc
          where pr.origin_country_id is not null and pr.origin_country_id = dc.id
        )
        or upper(regexp_replace(coalesce(pr.origin_country, ''), '\\s+', '', 'g'))
             = (select country_token from normalized_country)
        or exists (
          select 1
          from public.product_international_shipping pis
          left join destination_country dc on true
          where pis.product_id = pr.product_id
            and (
              (dc.id is not null and pis.country_id = dc.id)
              or upper(regexp_replace(coalesce(pis.country_name, ''), '\\s+', '', 'g'))
                   = (select country_token from normalized_country)
            )
        )
      ) as is_eligible,
      case
        when (
          exists (
            select 1 from destination_country dc
            where pr.origin_country_id is not null and pr.origin_country_id = dc.id
          )
          or upper(regexp_replace(coalesce(pr.origin_country, ''), '\\s+', '', 'g'))
               = (select country_token from normalized_country)
        ) then 0::numeric
        else coalesce(
          (
            select pis.shipping_charge
            from public.product_international_shipping pis
            left join destination_country dc on true
            where pis.product_id = pr.product_id
              and (
                (dc.id is not null and pis.country_id = dc.id)
                or upper(regexp_replace(coalesce(pis.country_name, ''), '\\s+', '', 'g'))
                     = (select country_token from normalized_country)
              )
            order by pis.id desc
            limit 1
          ),
          0
        )
      end as shipping_per_unit
    from product_rows pr
  ),
  priced as (
    select
      er.product_id,
      er.quantity,
      round(coalesce(gp.selling_price, er.price), 2) as selling_price,
      0::numeric as tax_rate,
      round(coalesce(gp.selling_price, er.price), 2) as public_unit_price,
      round(round(coalesce(gp.selling_price, er.price), 2) * er.quantity, 2) as line_total,
      coalesce(er.shipping_per_unit, 0) * er.quantity as shipping_total
    from eligible_rows er
    left join lateral (
      select g.selling_price
      from public.get_public_product_prices(array[er.product_id], p_country) g
      limit 1
    ) gp on true
    where er.is_eligible
  ),
  ineligible as (
    select
      er.product_id,
      coalesce(
        (
          select jsonb_agg(country_name)
          from (
            select distinct coalesce(c.country_name, pis.country_name) as country_name
            from public.product_international_shipping pis
            left join public.countries c on c.id = pis.country_id
            where pis.product_id = er.product_id
              and coalesce(c.country_name, pis.country_name) is not null
          ) country_list
        ),
        '[]'::jsonb
      ) as available_countries
    from eligible_rows er
    where not er.is_eligible
  ),
  totals as (
    select
      coalesce(sum(priced.line_total), 0)    as base_subtotal,
      coalesce(sum(priced.shipping_total), 0) as shipping
    from priced
  ),
  commission_rule as (
    select
      coalesce(r.charge_percent, 3) as charge_percent,
      coalesce(r.extra_charge, 0)   as extra_charge
    from public.platform_commission_rules r
    cross join totals t
    where r.is_active = true
      and t.base_subtotal >= coalesce(r.from_price, 0)
      and (r.to_price is null or t.base_subtotal <= r.to_price)
      and (
        (r.zone_code is not null and r.zone_code = (select zone_code from detected_zone))
        or
        (r.zone_code is null and r.country_id is not null
          and exists (select 1 from destination_country dc where dc.id = r.country_id))
        or
        (r.zone_code is null and r.country_id is null)
      )
    order by
      case when r.zone_code   is not null then 0 else 1 end,
      case when r.country_id  is null     then 1 else 0 end,
      coalesce(r.from_price, 0) desc,
      r.created_at desc
    limit 1
  ),
  commission as (
    select
      coalesce((select cr.charge_percent from commission_rule cr), 3) as charge_percent,
      coalesce((select cr.extra_charge   from commission_rule cr), 0) as extra_charge
  )
  select jsonb_build_object(
    'base_subtotal',             totals.base_subtotal,
    'buyer_product_subtotal',    totals.base_subtotal,
    'platform_handling_charge',  (totals.base_subtotal * commission.charge_percent / 100) + commission.extra_charge,
    'platform_commission_charge',(totals.base_subtotal * commission.charge_percent / 100) + commission.extra_charge,
    'shipping',                  totals.shipping,
    'total',                     totals.base_subtotal
                                   + ((totals.base_subtotal * commission.charge_percent / 100) + commission.extra_charge)
                                   + totals.shipping,
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id',        priced.product_id,
            'quantity',          priced.quantity,
            'selling_price',     priced.selling_price,
            'tax_rate',          priced.tax_rate,
            'public_unit_price', priced.public_unit_price,
            'line_total',        priced.line_total
          )
        )
        from priced
      ),
      '[]'::jsonb
    ),
    'ineligible_items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'product_id',          ineligible.product_id,
            'available_countries', ineligible.available_countries
          )
        )
        from ineligible
      ),
      '[]'::jsonb
    )
  )
  from totals
  cross join commission;
$function$
;

-- ===== get_public_product_prices =====
CREATE OR REPLACE FUNCTION public.get_public_product_prices(p_product_ids uuid[], p_country text DEFAULT NULL::text)
 RETURNS TABLE(product_id uuid, selling_price numeric, tax_rate numeric, public_unit_price numeric, markup_mrp numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select * from public.get_public_product_prices_with_overrides(p_product_ids, p_country, null::jsonb);
$function$
;

-- ===== get_public_product_prices_with_overrides =====
CREATE OR REPLACE FUNCTION public.get_public_product_prices_with_overrides(p_product_ids uuid[], p_country text DEFAULT NULL::text, p_price_overrides jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(product_id uuid, selling_price numeric, tax_rate numeric, public_unit_price numeric, markup_mrp numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with normalized_country as (
    select upper(regexp_replace(coalesce(p_country, ''), '\s+', '', 'g')) as country_token
  ),
  buyer_country as (
    select c.id
    from public.countries c
    cross join normalized_country nc
    where c.is_active = true
      and (
        upper(regexp_replace(coalesce(c.country_name, ''), '\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.country_code, ''), '\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.short_code, ''), '\s+', '', 'g')) = nc.country_token
        or upper(regexp_replace(coalesce(c.iso2, ''), '\s+', '', 'g')) = nc.country_token
      )
    order by c.country_name
    limit 1
  ),
  product_rows as (
    select
      p.id                                                      as product_id,
      coalesce(nullif(p.price, 0), 0)                           as raw_base_price,
      coalesce(nullif(p.default_selling_price, 0), p.price, 0)  as default_selling_price,
      coalesce(nullif(p.mrp, 0), 0)                             as base_mrp,
      -- Explicit variant price override provided by the caller (e.g. product details page)
      case
        when p_price_overrides is null then null
        when p_price_overrides ? p.id::text then (p_price_overrides ->> p.id::text)::numeric
        else null
      end as override_price
    from public.products p
    where p.id = any(p_product_ids)
  ),
  min_variant as (
    -- Cheapest available variant price per product (used for listing card display)
    select pv.product_id, min(pv.price) as min_price
    from public.product_variants pv
    where pv.product_id = any(p_product_ids)
      and pv.price is not null
      and pv.price > 0
    group by pv.product_id
  )
  select
    pr.product_id,

    -- ── SELLING PRICE ──────────────────────────────────────────────────────
    round(
      case
        -- Variant selected (override) + markup % known → apply markup to variant price
        when pr.override_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then pr.override_price * (1.0 + cp.markup_percent / 100.0)

        -- Variant selected but no markup (0% or NULL) → use override directly
        when pr.override_price is not null
          then coalesce(cp.selling_price, pr.override_price)

        -- Listing card + variants exist + markup % known → use min variant price with markup
        when mv.min_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then mv.min_price * (1.0 + cp.markup_percent / 100.0)

        -- Country flat price exists (no variants, or markup_percent = 0) → use stored price
        when cp.selling_price is not null
          then cp.selling_price

        -- Absolute fallback: product default selling price
        else pr.default_selling_price
      end,
      2
    ) as selling_price,

    0::numeric as tax_rate,

    -- ── PUBLIC UNIT PRICE (identical formula) ──────────────────────────────
    round(
      case
        when pr.override_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then pr.override_price * (1.0 + cp.markup_percent / 100.0)
        when pr.override_price is not null
          then coalesce(cp.selling_price, pr.override_price)
        when mv.min_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          then mv.min_price * (1.0 + cp.markup_percent / 100.0)
        when cp.selling_price is not null
          then cp.selling_price
        else pr.default_selling_price
      end,
      2
    ) as public_unit_price,

    -- ── MARKUP MRP ─────────────────────────────────────────────────────────
    -- Derive variant/listing MRP by scaling product.mrp proportionally to the
    -- variant price, then applying the same markup percent.
    round(
      case
        -- Override: scale product.mrp by (override / base) then apply markup
        when pr.override_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          and pr.base_mrp > 0
          and pr.raw_base_price > 0
          then (pr.override_price * (pr.base_mrp::numeric / pr.raw_base_price::numeric))
               * (1.0 + cp.markup_percent / 100.0)

        -- Min variant: same approach with min_price
        when mv.min_price is not null
          and cp.markup_percent is not null
          and cp.markup_percent > 0
          and pr.base_mrp > 0
          and pr.raw_base_price > 0
          then (mv.min_price * (pr.base_mrp::numeric / pr.raw_base_price::numeric))
               * (1.0 + cp.markup_percent / 100.0)

        -- Stored markup_mrp from country pricing row
        when cp.markup_mrp is not null and cp.markup_mrp > 0
          then cp.markup_mrp

        -- Fallback: raw product MRP
        when pr.base_mrp > 0
          then pr.base_mrp

        else null
      end,
      2
    ) as markup_mrp

  from product_rows pr
  left join buyer_country bc on true
  left join lateral (
    select pcsp.selling_price, pcsp.markup_percent, pcsp.markup_mrp
    from public.product_country_selling_prices pcsp
    where pcsp.product_id = pr.product_id
      and bc.id is not null
      and pcsp.country_id = bc.id
    limit 1
  ) cp on true
  left join min_variant mv on mv.product_id = pr.product_id;
$function$
;


-- 3. Trigger functions preserved from deleted migrations
--    (sync_products_default_selling_price and sync_country_price_markup_percent)

-- ===== sync_products_default_selling_price =====
CREATE OR REPLACE FUNCTION public.sync_products_default_selling_price()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.default_selling_price := coalesce(new.price, 0);
  return new;
end;
$function$
;

-- ===== sync_country_price_markup_percent =====
CREATE OR REPLACE FUNCTION public.sync_country_price_markup_percent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_base_price numeric;
begin
  -- Fetch the product's default_selling_price (or price as fallback)
  select coalesce(nullif(p.default_selling_price, 0), nullif(p.price, 0))
    into v_base_price
    from public.products p
   where p.id = NEW.product_id;

  if v_base_price is not null and v_base_price > 0 and NEW.selling_price is not null then
    NEW.markup_percent := round(((NEW.selling_price / v_base_price) - 1) * 100, 4);
  end if;

  return NEW;
end;
$function$
;

-- ===== apply_order_item_price_snapshots =====
CREATE OR REPLACE FUNCTION public.apply_order_item_price_snapshots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty numeric := greatest(coalesce(new.quantity, 0), 0);
  v_sku text;
  v_variant_price numeric;
  v_product_price numeric;
  v_parent_buyer_ccy  text;
  v_parent_seller_ccy text;
  v_parent_fx numeric;
BEGIN
  new.customer_unit_price := round(coalesce(new.customer_unit_price, new.price, 0), 2);

  IF new.seller_unit_price IS NULL THEN
    v_sku := upper(trim(coalesce(new.variant_info->>'sku', '')));

    IF new.product_id IS NOT NULL AND v_sku <> '' THEN
      SELECT pv.price
      INTO v_variant_price
      FROM public.product_variants pv
      WHERE pv.product_id = new.product_id
        AND upper(trim(coalesce(pv.sku, ''))) = v_sku
      ORDER BY pv.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF new.product_id IS NOT NULL THEN
      SELECT p.price
      INTO v_product_price
      FROM public.products p
      WHERE p.id = new.product_id
      LIMIT 1;
    END IF;

    new.seller_unit_price := round(coalesce(v_variant_price, v_product_price, new.customer_unit_price, 0), 2);
  ELSE
    new.seller_unit_price := round(coalesce(new.seller_unit_price, 0), 2);
  END IF;

  new.price := new.customer_unit_price;
  new.customer_line_total := round(coalesce(new.customer_line_total, new.customer_unit_price * v_qty), 2);
  new.seller_line_total   := round(coalesce(new.seller_line_total,   new.seller_unit_price   * v_qty), 2);

  -- Copy locked FX/currency snapshot from parent order
  SELECT upper(coalesce(o.currency, 'INR')),
         upper(coalesce(o.seller_currency, 'INR')),
         coalesce(o.buyer_to_seller_fx_rate, 1)
  INTO v_parent_buyer_ccy, v_parent_seller_ccy, v_parent_fx
  FROM public.orders o
  WHERE o.id = new.order_id;

  new.buyer_currency  := coalesce(new.buyer_currency,  v_parent_buyer_ccy, 'INR');
  new.seller_currency := coalesce(new.seller_currency, v_parent_seller_ccy, 'INR');
  new.locked_fx_rate  := coalesce(new.locked_fx_rate,  v_parent_fx, 1);

  -- Seller earning locked in seller currency (9% platform commission default)
  new.seller_earning_locked := coalesce(
    new.seller_earning_locked,
    round(new.seller_line_total * 0.91, 2)
  );

  RETURN new;
END;
$function$
;

-- ===== triggers =====
DROP TRIGGER IF EXISTS trg_products_sync_default_selling_price ON public.products;
CREATE TRIGGER trg_products_sync_default_selling_price BEFORE INSERT OR UPDATE OF price, default_selling_price ON public.products FOR EACH ROW EXECUTE FUNCTION sync_products_default_selling_price();

COMMIT;
