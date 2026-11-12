-- Forward-compatible reapplication for deployments where the original UK checkout migration is recorded.
begin;

create table if not exists public.uk_hosted_checkout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  stripe_session_id text unique,
  stripe_account_id text not null,
  livemode boolean not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency = 'gbp'),
  rpc_params jsonb not null check (jsonb_typeof(rpc_params) = 'object'),
  quote jsonb not null check (jsonb_typeof(quote) = 'object'),
  cart_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(cart_snapshot) = 'array'),
  order_id uuid references public.orders(id),
  payment_intent_id text unique,
  pricing_reconciliation_difference_minor bigint,
  notifications_created_at timestamptz,
  email_notifications_claimed_at timestamptz,
  email_notifications_sent_at timestamptz,
  push_notifications_claimed_at timestamptz,
  push_notifications_sent_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.uk_hosted_checkout_sessions
  add column if not exists pricing_reconciliation_difference_minor bigint,
  add column if not exists email_notifications_claimed_at timestamptz,
  add column if not exists email_notifications_sent_at timestamptz,
  add column if not exists push_notifications_claimed_at timestamptz,
  add column if not exists push_notifications_sent_at timestamptz;

create table if not exists public.uk_stripe_customers (
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_account_id text not null,
  livemode boolean not null,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, stripe_account_id, livemode),
  unique (stripe_account_id, livemode, stripe_customer_id)
);

alter table public.uk_hosted_checkout_sessions enable row level security;
revoke all on public.uk_hosted_checkout_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.uk_hosted_checkout_sessions to service_role;
alter table public.uk_stripe_customers enable row level security;
revoke all on public.uk_stripe_customers from public, anon, authenticated;
grant select, insert, update, delete on public.uk_stripe_customers to service_role;

create unique index if not exists uk_hosted_checkout_one_active_user
  on public.uk_hosted_checkout_sessions(user_id)
  where order_id is null and closed_at is null;

create or replace function public.quote_uk_hosted_checkout_total(
  p_items jsonb,
  p_country text,
  p_shipping_charge numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country_token text;
  v_zone_code text;
  v_destination_country_id uuid;
  v_buyer_rate numeric;
  v_inr_rate numeric;
  v_fx numeric;
  v_product_subtotal_inr numeric;
  v_product_subtotal numeric;
  v_commission_percent numeric;
  v_commission_extra numeric;
  v_platform_handling_charge numeric;
  v_total_amount numeric;
  v_distinct_sellers uuid[];
  v_seller_id uuid;
  v_seller_country_id uuid;
  v_seller_currency text := 'INR';
  v_seller_rate numeric;
  v_buyer_to_seller_fx_rate numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0
    or p_shipping_charge is null or p_shipping_charge < 0 then
    raise exception 'Invalid UK checkout pricing input';
  end if;

  v_country_token := regexp_replace(upper(coalesce(p_country, '')), '\s+', '', 'g');
  if v_country_token not in ('GB', 'GBR', 'UK', 'UNITEDKINGDOM') then
    raise exception 'UK destination is required';
  end if;
  v_zone_code := 'UK';

  select c.id into v_destination_country_id
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

  select exchange_rate into v_inr_rate
  from public.countries where upper(currency_code) = 'INR' and is_active = true limit 1;
  select exchange_rate into v_buyer_rate
  from public.countries where upper(currency_code) = 'GBP' and is_active = true limit 1;
  if coalesce(v_inr_rate, 0) <= 0 or coalesce(v_buyer_rate, 0) <= 0 then
    raise exception 'Required UK exchange rates are unavailable';
  end if;
  v_fx := round(v_buyer_rate / v_inr_rate, 8);

  select coalesce(sum(round(coalesce(gp.selling_price, priced.base_price) * priced.quantity, 2)), 0)
  into v_product_subtotal_inr
  from (
    select
      p.id as product_id,
      (item->>'quantity')::integer as quantity,
      case
        when (select count(*) from public.product_variants where product_id = p.id) > 1
          then coalesce(pv.price, p.price)
        else p.price
      end as base_price
    from jsonb_array_elements(p_items) item
    join public.products p on p.id = (item->>'product_id')::uuid
    left join public.product_variants pv
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
    raise exception 'Invalid product subtotal';
  end if;
  v_product_subtotal := round(v_product_subtotal_inr * v_fx, 2);

  select coalesce(r.charge_percent, 9), coalesce(r.extra_charge, 0)
  into v_commission_percent, v_commission_extra
  from public.platform_commission_rules r
  where r.is_active = true
    and v_product_subtotal >= coalesce(r.from_price, 0)
    and (r.to_price is null or v_product_subtotal <= r.to_price)
    and (
      (r.zone_code is not null and r.zone_code = v_zone_code)
      or (r.zone_code is null and r.country_id is not null and r.country_id = v_destination_country_id)
      or (r.zone_code is null and r.country_id is null)
    )
  order by
    case when r.zone_code is not null then 0 else 1 end,
    case when r.country_id is null then 1 else 0 end,
    coalesce(r.from_price, 0) desc,
    r.created_at desc
  limit 1;
  if v_commission_percent is null then
    v_commission_percent := 9;
    v_commission_extra := 0;
  end if;

  select array_agg(distinct p.seller_id)
  into v_distinct_sellers
  from jsonb_array_elements(p_items) item
  join public.products p on p.id = (item->>'product_id')::uuid
  where p.seller_id is not null;
  if array_length(v_distinct_sellers, 1) = 1 then
    v_seller_id := v_distinct_sellers[1];
    select p.country_id into v_seller_country_id
    from public.profiles p where p.id = v_seller_id;
    if v_seller_country_id is not null then
      select upper(c.currency_code), c.exchange_rate
      into v_seller_currency, v_seller_rate
      from public.countries c where c.id = v_seller_country_id;
    end if;
  end if;
  v_seller_currency := coalesce(v_seller_currency, 'INR');
  if coalesce(v_seller_rate, 0) <= 0 then
    v_seller_rate := v_inr_rate;
  end if;
  v_buyer_to_seller_fx_rate := round(v_seller_rate / v_buyer_rate, 8);

  v_platform_handling_charge := round(
    (v_product_subtotal + p_shipping_charge) * v_commission_percent / 100, 2
  );
  v_total_amount := round(v_product_subtotal + p_shipping_charge + v_platform_handling_charge, 2);
  return jsonb_build_object(
    'product_subtotal', v_product_subtotal,
    'shipping_charge', p_shipping_charge,
    'commission_percent', v_commission_percent,
    'commission_extra', coalesce(v_commission_extra, 0),
    'platform_handling_charge', v_platform_handling_charge,
    'total_amount', v_total_amount,
    'financial_snapshot', jsonb_build_object(
      'buyer_currency', 'GBP',
      'buyer_rate', v_buyer_rate,
      'inr_rate', v_inr_rate,
      'seller_currency', v_seller_currency,
      'seller_rate', v_seller_rate,
      'buyer_to_seller_fx_rate', v_buyer_to_seller_fx_rate,
      'commission_percent', v_commission_percent
    )
  );
end;
$$;

revoke all on function public.quote_uk_hosted_checkout_total(jsonb, text, numeric)
  from public, anon, authenticated;
grant execute on function public.quote_uk_hosted_checkout_total(jsonb, text, numeric) to service_role;

create or replace function public.recover_uk_hosted_checkout(
  p_snapshot_id uuid,
  p_session_id text,
  p_account_id text,
  p_livemode boolean,
  p_payment_intent_id text,
  p_amount_minor bigint,
  p_currency text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.uk_hosted_checkout_sessions%rowtype;
  v_rpc jsonb;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_cart_row jsonb;
  v_line record;
  v_item_id uuid;
  v_matches integer;
  v_subtotal numeric;
  v_discount numeric;
  v_shipping numeric;
  v_platform_handling_charge numeric;
  v_financial jsonb;
  v_seller_currency text;
  v_buyer_rate numeric;
  v_inr_rate numeric;
  v_seller_rate numeric;
  v_buyer_to_seller_fx_rate numeric;
  v_commission_percent numeric;
  v_seller_items numeric;
  v_seller_payout numeric;
  v_buyer_paid_inr numeric;
  v_seller_items_inr numeric;
  v_stock_snapshot jsonb := '{}'::jsonb;
  v_variant_snapshot jsonb := '{}'::jsonb;
  v_stock_row record;
  v_product_id uuid;
  v_variant_id uuid;
  v_variant_stock integer;
  v_variant_quantity integer;
  v_variant_updated_at timestamptz;
  v_product_updated_at timestamptz;
  v_product_variant_count integer;
  v_qty integer;
  v_sku text;
  v_order_total_minor bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  if p_session_id !~ '^cs_[A-Za-z0-9_]+$'
    or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'
    or p_amount_minor is null or p_amount_minor <= 0 then
    raise exception 'Invalid payment details';
  end if;

  select * into v_snapshot from public.uk_hosted_checkout_sessions
    where id = p_snapshot_id for update;
  if not found or v_snapshot.stripe_session_id is distinct from p_session_id
    or v_snapshot.stripe_account_id is distinct from p_account_id
    or v_snapshot.livemode is distinct from p_livemode
    or v_snapshot.amount_minor is distinct from p_amount_minor
    or v_snapshot.currency is distinct from p_currency then
    raise exception 'Checkout session does not match snapshot';
  end if;

  v_rpc := v_snapshot.rpc_params;
  if v_rpc->>'p_user_id' is distinct from v_snapshot.user_id::text
    or lower(coalesce(v_rpc->>'p_currency', '')) is distinct from p_currency
    or jsonb_typeof(v_rpc->'p_items') is distinct from 'array'
    or jsonb_array_length(v_rpc->'p_items') = 0 then
    raise exception 'Invalid checkout snapshot';
  end if;
  v_subtotal := (v_snapshot.quote->>'subtotal')::numeric;
  v_discount := (v_snapshot.quote->>'offer_discount')::numeric;
  v_shipping := (v_snapshot.quote->>'shipping')::numeric;
  v_platform_handling_charge := (v_snapshot.quote->>'platform_handling_charge')::numeric;
  v_financial := v_snapshot.quote->'financial_snapshot';
  v_seller_currency := upper(coalesce(v_financial->>'seller_currency', ''));
  v_buyer_rate := (v_financial->>'buyer_rate')::numeric;
  v_inr_rate := (v_financial->>'inr_rate')::numeric;
  v_seller_rate := (v_financial->>'seller_rate')::numeric;
  v_buyer_to_seller_fx_rate := (v_financial->>'buyer_to_seller_fx_rate')::numeric;
  v_commission_percent := (v_financial->>'commission_percent')::numeric;
  if v_subtotal is null or v_subtotal <= 0 or v_discount is null or v_discount < 0
    or v_discount > v_subtotal or v_shipping is null or v_shipping < 0
    or v_platform_handling_charge is null or v_platform_handling_charge < 0
    or jsonb_typeof(v_financial) is distinct from 'object'
    or upper(coalesce(v_financial->>'buyer_currency', '')) <> 'GBP'
    or v_seller_currency = ''
    or coalesce(v_buyer_rate, 0) <= 0 or coalesce(v_inr_rate, 0) <= 0
    or coalesce(v_seller_rate, 0) <= 0 or coalesce(v_buyer_to_seller_fx_rate, 0) <= 0
    or v_commission_percent is null or v_commission_percent < 0
    or round((v_subtotal - v_discount + v_shipping + v_platform_handling_charge) * 100) <> p_amount_minor
    or (v_snapshot.quote->>'total')::numeric * 100 <> p_amount_minor
    or jsonb_typeof(v_snapshot.quote->'lines') is distinct from 'array'
    or jsonb_array_length(v_snapshot.quote->'lines') <> jsonb_array_length(v_rpc->'p_items') then
    raise exception 'Saved checkout amounts do not match payment';
  end if;

  if v_snapshot.order_id is null then
    for v_item_id in
      select distinct (item->>'product_id')::uuid
      from jsonb_array_elements(v_rpc->'p_items') item
      order by 1
    loop
      if not (v_stock_snapshot ? v_item_id::text) then
        select stock, updated_at into v_qty, v_product_updated_at
        from public.products where id = v_item_id for update;
        if not found then
          raise exception 'Checkout product no longer exists';
        end if;
        v_stock_snapshot := v_stock_snapshot || jsonb_build_object(
          v_item_id::text,
          jsonb_build_object('stock', v_qty, 'updated_at', v_product_updated_at)
        );
      end if;
    end loop;

    -- Let the existing order RPC complete paid orders even if stock was sold
    -- after payment. These temporary increments are in the same transaction:
    -- the RPC consumes them before commit, so the shared stock values remain
    -- unchanged while the UK order is recorded as an accepted oversell.
    for v_line in
      select value as item from jsonb_array_elements(v_rpc->'p_items')
    loop
      v_product_id := (v_line.item->>'product_id')::uuid;
      v_qty := (v_line.item->>'quantity')::integer;
      v_sku := upper(trim(coalesce(v_line.item->'variant_info'->>'sku', '')));
      select count(*) into v_product_variant_count
      from public.product_variants where product_id = v_product_id;
      if v_product_variant_count > 1 and v_sku <> '' then
        select id, stock, quantity, updated_at
        into v_variant_id, v_variant_stock, v_variant_quantity, v_variant_updated_at
        from public.product_variants
        where product_id = v_product_id and upper(trim(sku)) = v_sku
        for update;
        if not found then
          raise exception 'Checkout variant no longer exists';
        end if;
        if not (v_variant_snapshot ? v_variant_id::text) then
          v_variant_snapshot := v_variant_snapshot || jsonb_build_object(
            v_variant_id::text,
            jsonb_build_object(
              'stock', v_variant_stock,
              'quantity', v_variant_quantity,
              'updated_at', v_variant_updated_at
            )
          );
        end if;
        update public.product_variants
        set stock = stock + v_qty, quantity = quantity + v_qty, updated_at = now()
        where id = v_variant_id;
      else
        update public.products set stock = stock + v_qty, updated_at = now()
        where id = v_product_id;
        if not found then
          raise exception 'Checkout product no longer exists';
        end if;
      end if;
    end loop;

    perform set_config('request.jwt.claim.sub', v_snapshot.user_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    v_result := public.create_order_secure(
      v_snapshot.user_id,
      v_rpc->'p_items',
      v_rpc->'p_shipping_address',
      case when jsonb_typeof(v_rpc->'p_billing_address') = 'object' then v_rpc->'p_billing_address' else null end,
      nullif(v_rpc->>'p_phone', ''),
      nullif(v_rpc->>'p_notes', ''),
      p_payment_intent_id,
      'card',
      'pending',
      'processing',
      upper(p_currency),
      coalesce(nullif(v_rpc->>'p_shipping_charge', '')::numeric, 0),
      coalesce(nullif(v_rpc->>'p_actual_shipping_cost', '')::numeric, 0),
      coalesce(nullif(v_rpc->>'p_platform_shipping_margin', '')::numeric, 0),
      null,
      'stripe_' || p_payment_intent_id,
      nullif(v_rpc->>'p_shipping_carrier', ''),
      nullif(v_rpc->>'p_shipping_service_level', ''),
      nullif(v_rpc->>'p_shipping_provider', ''),
      nullif(v_rpc->>'p_shipping_rate_id', ''),
      nullif(v_rpc->>'p_expected_delivery_date', '')::timestamptz,
      nullif(v_rpc->>'p_expected_delivery_days', '')::integer,
      nullif(v_rpc->>'p_country', '')
    );
    for v_stock_row in select key, value from jsonb_each(v_variant_snapshot)
    loop
      update public.product_variants
      set stock = (v_stock_row.value->>'stock')::integer,
          quantity = (v_stock_row.value->>'quantity')::integer,
          updated_at = (v_stock_row.value->>'updated_at')::timestamptz
      where id = v_stock_row.key::uuid;
    end loop;
    for v_stock_row in select key, value from jsonb_each(v_stock_snapshot)
    loop
      update public.products
      set stock = (v_stock_row.value->>'stock')::integer,
          updated_at = (v_stock_row.value->>'updated_at')::timestamptz
      where id = v_stock_row.key::uuid;
    end loop;
    select * into v_order from public.orders where id = (v_result->>'id')::uuid for update;
  else
    if v_snapshot.payment_intent_id is distinct from p_payment_intent_id then
      raise exception 'Payment intent does not match recovered order';
    end if;
    select * into v_order from public.orders where id = v_snapshot.order_id for update;
  end if;

  if v_order.id is null or v_order.user_id is distinct from v_snapshot.user_id
    or v_order.payment_intent_id is distinct from p_payment_intent_id
    or lower(v_order.currency) is distinct from p_currency
    or lower(coalesce(v_order.status, '')) in ('cancelled', 'canceled')
    or lower(coalesce(v_order.payment_status, '')) not in ('pending', 'completed', 'paid', 'succeeded') then
    raise exception 'Recovered order does not match payment';
  end if;

  if v_snapshot.order_id is null then
    for v_line in
      select item.value as item, line.value as quote
      from jsonb_array_elements(v_rpc->'p_items') with ordinality item(value, position)
      join jsonb_array_elements(v_snapshot.quote->'lines') with ordinality line(value, position)
        on item.position = line.position
    loop
      if v_line.quote->>'productId' is distinct from v_line.item->>'product_id'
        or (v_line.quote->>'quantity')::integer is distinct from (v_line.item->>'quantity')::integer
        or coalesce((v_line.quote->>'convertedUnitPrice')::numeric, 0) <= 0
        or coalesce((v_line.quote->>'convertedLineTotal')::numeric, 0) <= 0
        or coalesce((v_line.quote->>'seller_unit_price')::numeric, 0) <= 0 then
        raise exception 'Saved checkout line does not match order';
      end if;
      select count(*), min(id::text)::uuid into v_matches, v_item_id
      from public.order_items
      where order_id = v_order.id
        and product_id = (v_line.item->>'product_id')::uuid
        and quantity = (v_line.item->>'quantity')::integer
        and coalesce(variant_info->>'size', '') = coalesce(v_line.item->'variant_info'->>'size', '')
        and coalesce(variant_info->>'color', '') = coalesce(v_line.item->'variant_info'->>'color', '')
        and coalesce(variant_info->>'sku', '') = coalesce(v_line.item->'variant_info'->>'sku', '');
      if v_matches <> 1 then
        raise exception 'Recovered order line does not match checkout';
      end if;
      update public.order_items
      set price = (v_line.quote->>'convertedUnitPrice')::numeric,
          customer_unit_price = (v_line.quote->>'convertedUnitPrice')::numeric,
          customer_line_total = (v_line.quote->>'convertedLineTotal')::numeric,
          seller_unit_price = (v_line.quote->>'seller_unit_price')::numeric,
          seller_line_total = round(
            (v_line.quote->>'seller_unit_price')::numeric * (v_line.item->>'quantity')::integer, 2
          ),
          seller_earning = round(
            (v_line.quote->>'seller_unit_price')::numeric
              * (v_line.item->>'quantity')::integer
              * (1 - v_commission_percent / 100), 2
          ),
          seller_earning_locked = round(
            (v_line.quote->>'seller_unit_price')::numeric
              * (v_line.item->>'quantity')::integer * 0.91, 2
          ),
          buyer_currency = 'GBP',
          seller_currency = v_seller_currency,
          locked_fx_rate = v_buyer_to_seller_fx_rate
      where id = v_item_id;
    end loop;
    select coalesce(sum(seller_line_total), 0), coalesce(sum(seller_earning_locked), 0)
    into v_seller_items, v_seller_payout
    from public.order_items where order_id = v_order.id;
    v_buyer_paid_inr := round((p_amount_minor::numeric / 100) * v_inr_rate / v_buyer_rate, 2);
    v_seller_items_inr := round(v_seller_items * v_inr_rate / v_seller_rate, 2);
    update public.orders
    set total_amount = p_amount_minor::numeric / 100,
        product_subtotal = v_subtotal,
        offer_discount = v_discount,
        shipping_charge = v_shipping,
        seller_currency = v_seller_currency,
        buyer_to_seller_fx_rate = v_buyer_to_seller_fx_rate,
        fx_locked_at = v_snapshot.created_at,
        seller_items_subtotal = round(v_seller_items, 2),
        seller_payout_total = round(v_seller_payout, 2),
        platform_markup_total_inr = round(v_buyer_paid_inr - v_seller_items_inr, 2)
    where id = v_order.id;
    v_order_total_minor := round(v_order.total_amount * 100)::bigint;
    update public.uk_hosted_checkout_sessions
    set pricing_reconciliation_difference_minor =
      v_order_total_minor - p_amount_minor - round(v_discount * 100)::bigint
    where id = v_snapshot.id;
  elsif v_order.total_amount * 100 <> p_amount_minor then
    raise exception 'Recovered order total does not match payment';
  end if;

  update public.orders set payment_status = 'completed', updated_at = now()
    where id = v_order.id and payment_status is distinct from 'completed';
  insert into public.payment_intents (order_id, stripe_payment_intent_id, status, amount, currency)
    values (v_order.id, p_payment_intent_id, 'succeeded', p_amount_minor::numeric / 100, p_currency)
    on conflict (stripe_payment_intent_id) do nothing;
  if not exists (
    select 1 from public.payment_intents where stripe_payment_intent_id = p_payment_intent_id
      and order_id = v_order.id and amount = p_amount_minor::numeric / 100 and currency = p_currency
  ) then
    raise exception 'Payment record does not match order';
  end if;
  update public.payment_intents set status = 'succeeded'
    where stripe_payment_intent_id = p_payment_intent_id and status is distinct from 'succeeded';
  if v_snapshot.order_id is null then
    for v_cart_row in select value from jsonb_array_elements(v_snapshot.cart_snapshot)
    loop
      delete from public.cart_items
      where id = (v_cart_row->>'id')::uuid
        and user_id = v_snapshot.user_id
        and quantity = (v_cart_row->>'quantity')::integer
        and updated_at = (v_cart_row->>'updated_at')::timestamptz;
    end loop;
  end if;
  update public.uk_hosted_checkout_sessions
    set order_id = v_order.id, payment_intent_id = p_payment_intent_id, updated_at = now()
    where id = v_snapshot.id;
  return jsonb_build_object('id', v_order.id);
end;
$$;

revoke all on function public.recover_uk_hosted_checkout(uuid, text, text, boolean, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.recover_uk_hosted_checkout(uuid, text, text, boolean, text, bigint, text)
  to service_role;

create or replace function public.notify_uk_hosted_order(p_snapshot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.uk_hosted_checkout_sessions%rowtype;
  v_order_number text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  select * into v_snapshot from public.uk_hosted_checkout_sessions
    where id = p_snapshot_id for update;
  if not found or v_snapshot.order_id is null or not exists (
    select 1 from public.orders o where o.id = v_snapshot.order_id
      and o.user_id = v_snapshot.user_id and o.payment_status = 'completed'
  ) then
    raise exception 'UK paid order not found';
  end if;
  if v_snapshot.notifications_created_at is not null then
    return;
  end if;
  select order_number into v_order_number
  from public.orders where id = v_snapshot.order_id;
  insert into public.notifications (user_id, type, title, message, metadata)
  select recipients.user_id, 'order_placed', 'Order Placed Successfully',
    'Your order has been placed and is being processed.',
    jsonb_build_object('order_id', v_snapshot.order_id, 'order_number', v_order_number)
  from (
    select v_snapshot.user_id as user_id
    union
    select oi.seller_id from public.order_items oi
      where oi.order_id = v_snapshot.order_id and oi.seller_id is not null
    union
    select p.id from public.profiles p where p.role = 'admin'
  ) recipients;
  if coalesce(v_snapshot.pricing_reconciliation_difference_minor, 0) <> 0 then
    insert into public.notifications (user_id, type, title, message, metadata)
    select p.id, 'info', 'UK checkout pricing needs review',
      'A paid UK checkout differs from the shared order RPC total. Review the order accounting.',
      jsonb_build_object(
        'order_id', v_snapshot.order_id,
        'order_number', v_order_number,
        'difference_minor', v_snapshot.pricing_reconciliation_difference_minor
      )
    from public.profiles p where p.role = 'admin';
  end if;
  update public.uk_hosted_checkout_sessions
    set notifications_created_at = now(), updated_at = now()
    where id = p_snapshot_id;
end;
$$;

revoke all on function public.notify_uk_hosted_order(uuid) from public, anon, authenticated;
grant execute on function public.notify_uk_hosted_order(uuid) to service_role;

create or replace function public.claim_uk_hosted_order_email(p_snapshot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.uk_hosted_checkout_sessions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  select * into v_snapshot from public.uk_hosted_checkout_sessions
    where id = p_snapshot_id for update;
  if not found or v_snapshot.order_id is null or v_snapshot.payment_intent_id is null
    or not exists (
      select 1 from public.orders o where o.id = v_snapshot.order_id
        and o.user_id = v_snapshot.user_id and o.payment_status = 'completed'
    ) then
    raise exception 'UK paid order not found';
  end if;
  if v_snapshot.email_notifications_sent_at is not null
    or (v_snapshot.email_notifications_claimed_at is not null
      and v_snapshot.email_notifications_claimed_at > now() - interval '2 minutes') then
    return false;
  end if;
  update public.uk_hosted_checkout_sessions
    set email_notifications_claimed_at = now(), updated_at = now()
    where id = p_snapshot_id;
  return true;
end;
$$;

revoke all on function public.claim_uk_hosted_order_email(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_uk_hosted_order_email(uuid) to service_role;

create or replace function public.complete_uk_hosted_order_email(p_snapshot_id uuid, p_sent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  update public.uk_hosted_checkout_sessions
    set email_notifications_sent_at = case when p_sent then now() else email_notifications_sent_at end,
        email_notifications_claimed_at = null,
        updated_at = now()
    where id = p_snapshot_id and order_id is not null and payment_intent_id is not null;
  if not found then
    raise exception 'UK paid order not found';
  end if;
end;
$$;

revoke all on function public.complete_uk_hosted_order_email(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_uk_hosted_order_email(uuid, boolean) to service_role;

create or replace function public.claim_uk_hosted_order_push(p_snapshot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.uk_hosted_checkout_sessions%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  select * into v_snapshot from public.uk_hosted_checkout_sessions
    where id = p_snapshot_id for update;
  if not found or v_snapshot.order_id is null or v_snapshot.payment_intent_id is null then
    raise exception 'UK paid order not found';
  end if;
  if v_snapshot.push_notifications_sent_at is not null
    or (v_snapshot.push_notifications_claimed_at is not null
      and v_snapshot.push_notifications_claimed_at > now() - interval '2 minutes') then
    return false;
  end if;
  update public.uk_hosted_checkout_sessions
    set push_notifications_claimed_at = now(), updated_at = now()
    where id = p_snapshot_id;
  return true;
end;
$$;

revoke all on function public.claim_uk_hosted_order_push(uuid) from public, anon, authenticated;
grant execute on function public.claim_uk_hosted_order_push(uuid) to service_role;

create or replace function public.complete_uk_hosted_order_push(p_snapshot_id uuid, p_sent boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  update public.uk_hosted_checkout_sessions
    set push_notifications_sent_at = case when p_sent then now() else push_notifications_sent_at end,
        push_notifications_claimed_at = null,
        updated_at = now()
    where id = p_snapshot_id and order_id is not null and payment_intent_id is not null;
  if not found then
    raise exception 'UK paid order not found';
  end if;
end;
$$;

revoke all on function public.complete_uk_hosted_order_push(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.complete_uk_hosted_order_push(uuid, boolean) to service_role;

commit;
