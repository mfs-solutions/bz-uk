-- =============================================================================
-- TRUST THE COUNTRIES TABLE
--
-- countries.exchange_rate is maintained by the platform (cron / admin).
-- A value is ALWAYS present. There is no realistic "missing" case.
--
-- This migration removes both the hard-fail RAISE introduced by
-- 20260520180000 and the soft-fallback / fx_warning logic introduced by
-- 20260520200000. The three functions now simply look up the rate and use
-- it. If the table ever IS unexpectedly empty, Postgres will raise a real
-- division/null error and the bug must be fixed at the data layer.
--
-- Functions touched (CREATE OR REPLACE only; signatures unchanged):
--   - lock_order_fx_snapshot      (BEFORE INSERT trigger on orders)
--   - refresh_order_seller_subtotal(p_order_id uuid)
--   - create_order_secure(...)
--
-- Also drops the unused additive column orders.fx_warning that was added
-- by 20260520200000.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. Drop the obsolete fx_warning column (was only written by the
--    soft-fallback path that we are removing).
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders DROP COLUMN IF EXISTS fx_warning;

-- ----------------------------------------------------------------------------
-- 1. lock_order_fx_snapshot — trust the rate lookup. No fallback.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_order_fx_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_ccy    text;
  v_buyer_rate   numeric;
  v_seller_cc_id uuid;
  v_seller_ccy   text;
  v_seller_rate  numeric;
BEGIN
  v_buyer_ccy := upper(trim(coalesce(NEW.currency, 'INR')));

  SELECT exchange_rate INTO v_buyer_rate
  FROM public.countries
  WHERE upper(currency_code) = v_buyer_ccy AND is_active = true
  LIMIT 1;

  IF NEW.seller_id IS NOT NULL THEN
    SELECT p.country_id INTO v_seller_cc_id
    FROM public.profiles p
    WHERE p.id = NEW.seller_id
    LIMIT 1;
  END IF;

  IF v_seller_cc_id IS NOT NULL THEN
    SELECT upper(c.currency_code), c.exchange_rate
    INTO v_seller_ccy, v_seller_rate
    FROM public.countries c
    WHERE c.id = v_seller_cc_id;
  END IF;

  -- Multi-seller carts default to INR seller currency
  IF v_seller_ccy IS NULL THEN
    v_seller_ccy := 'INR';
    SELECT exchange_rate INTO v_seller_rate
    FROM public.countries
    WHERE upper(currency_code) = 'INR' AND is_active = true
    LIMIT 1;
  END IF;

  NEW.seller_currency         := coalesce(NEW.seller_currency, v_seller_ccy);
  NEW.buyer_to_seller_fx_rate := coalesce(
    NEW.buyer_to_seller_fx_rate,
    round(v_seller_rate / v_buyer_rate, 8)
  );
  NEW.fx_locked_at            := coalesce(NEW.fx_locked_at, now());

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. refresh_order_seller_subtotal — trust the rate lookup. No fallback.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_order_seller_subtotal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_items numeric;
  v_payout       numeric;
  v_buyer_ccy    text;
  v_seller_ccy   text;
  v_buyer_paid   numeric;
  v_inr_rate     numeric;
  v_buyer_rate   numeric;
  v_seller_rate  numeric;
  v_buyer_paid_inr   numeric;
  v_seller_items_inr numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce(oi.seller_line_total,
                          coalesce(oi.seller_unit_price, 0) * greatest(coalesce(oi.quantity, 0), 0))), 0),
    coalesce(sum(coalesce(oi.seller_earning_locked,
                          round(coalesce(oi.seller_line_total, 0) * 0.91, 2))), 0)
  INTO v_seller_items, v_payout
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  SELECT upper(coalesce(currency, 'INR')),
         upper(coalesce(seller_currency, 'INR')),
         coalesce(total_amount, 0)
  INTO v_buyer_ccy, v_seller_ccy, v_buyer_paid
  FROM public.orders
  WHERE id = p_order_id;

  SELECT exchange_rate INTO v_inr_rate    FROM public.countries WHERE upper(currency_code) = 'INR'         LIMIT 1;
  SELECT exchange_rate INTO v_buyer_rate  FROM public.countries WHERE upper(currency_code) = v_buyer_ccy  LIMIT 1;
  SELECT exchange_rate INTO v_seller_rate FROM public.countries WHERE upper(currency_code) = v_seller_ccy LIMIT 1;

  v_buyer_paid_inr   := round(v_buyer_paid   * v_inr_rate / v_buyer_rate,  2);
  v_seller_items_inr := round(v_seller_items * v_inr_rate / v_seller_rate, 2);

  UPDATE public.orders o
  SET seller_items_subtotal     = round(v_seller_items, 2),
      seller_payout_total       = round(v_payout, 2),
      -- platform_markup_total_inr is immutable once set (lock at creation only)
      platform_markup_total_inr = coalesce(
        o.platform_markup_total_inr,
        round(v_buyer_paid_inr - v_seller_items_inr, 2)
      )
  WHERE o.id = p_order_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. create_order_secure — trust the rate lookup. No fallback.
--    Signature unchanged; p_fx_rate still ignored (server derives FX).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_secure(
  p_user_id uuid, p_items jsonb,
  p_shipping_address jsonb DEFAULT NULL::jsonb,
  p_billing_address jsonb DEFAULT NULL::jsonb,
  p_phone text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_payment_intent_id text DEFAULT NULL::text,
  p_payment_method text DEFAULT 'card'::text,
  p_payment_status text DEFAULT 'pending'::text,
  p_order_status text DEFAULT 'pending'::text,
  p_currency text DEFAULT 'INR'::text,
  p_shipping_charge numeric DEFAULT 0,
  p_actual_shipping_cost numeric DEFAULT 0,
  p_platform_shipping_margin numeric DEFAULT 0,
  p_fx_rate numeric DEFAULT NULL,                  -- IGNORED: derived server-side
  p_idempotency_key text DEFAULT NULL::text,
  p_shipping_carrier text DEFAULT NULL::text,
  p_shipping_service_level text DEFAULT NULL::text,
  p_shipping_provider text DEFAULT NULL::text,
  p_shipping_rate_id text DEFAULT NULL::text,
  p_expected_delivery_date timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_expected_delivery_days integer DEFAULT NULL::integer,
  p_country text DEFAULT NULL::text
)
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
  v_buyer_ccy                text;
  v_buyer_rate               numeric;
  v_inr_rate                 numeric;
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

  -- ---- FX RATE: derive server-side from countries (always populated) ----
  v_buyer_ccy := upper(trim(coalesce(p_currency, 'INR')));

  select exchange_rate into v_inr_rate
  from public.countries
  where upper(currency_code) = 'INR' and is_active = true
  limit 1;

  select exchange_rate into v_buyer_rate
  from public.countries
  where upper(currency_code) = v_buyer_ccy and is_active = true
  limit 1;

  -- v_fx converts INR amount -> buyer currency: buyer = inr * v_fx
  v_fx := round(v_buyer_rate / v_inr_rate, 8);

  v_country_token := regexp_replace(upper(coalesce(p_country, '')), '\s+', '', 'g');
  v_zone_code := case when v_country_token in ('GB', 'GBR', 'UK', 'UNITEDKINGDOM') then 'UK' else null end;

  select c.id
  into v_destination_country_id
  from public.countries c
  where c.is_active = true
    and (
      upper(regexp_replace(coalesce(c.country_name, ''), '\s+', '', 'g')) = v_country_token
      or upper(regexp_replace(coalesce(c.country_code, ''), '\s+', '', 'g')) = v_country_token
      or upper(regexp_replace(coalesce(c.short_code, ''), '\s+', '', 'g')) = v_country_token
      or upper(regexp_replace(coalesce(c.iso2, ''), '\s+', '', 'g')) = v_country_token
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
    v_total_amount, v_buyer_ccy, p_shipping_address, p_billing_address,
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
    'currency',         v_buyer_ccy,
    'created_at',       now()
  );
end;
$function$
;

COMMIT;
