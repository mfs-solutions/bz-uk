begin;

create table public.uk_hosted_checkout_sessions (
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
  notifications_created_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.uk_hosted_checkout_sessions enable row level security;
revoke all on public.uk_hosted_checkout_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.uk_hosted_checkout_sessions to service_role;

create unique index uk_hosted_checkout_one_active_user
  on public.uk_hosted_checkout_sessions(user_id)
  where order_id is null and closed_at is null;

create function public.recover_uk_hosted_checkout(
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
  if v_subtotal is null or v_subtotal <= 0 or v_discount is null or v_discount < 0
    or v_discount > v_subtotal or v_shipping is null or v_shipping < 0
    or round((v_subtotal - v_discount + v_shipping) * 100) <> p_amount_minor
    or (v_snapshot.quote->>'total')::numeric * 100 <> p_amount_minor
    or jsonb_typeof(v_snapshot.quote->'lines') is distinct from 'array'
    or jsonb_array_length(v_snapshot.quote->'lines') <> jsonb_array_length(v_rpc->'p_items') then
    raise exception 'Saved checkout amounts do not match payment';
  end if;

  if v_snapshot.order_id is null then
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
        or coalesce((v_line.quote->>'convertedLineTotal')::numeric, 0) <= 0 then
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
          customer_line_total = (v_line.quote->>'convertedLineTotal')::numeric
      where id = v_item_id;
    end loop;
    update public.orders
    set total_amount = p_amount_minor::numeric / 100,
        product_subtotal = v_subtotal,
        offer_discount = v_discount,
        shipping_charge = v_shipping
    where id = v_order.id;
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

create function public.notify_uk_hosted_order(p_snapshot_id uuid)
returns void
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
  if not found or v_snapshot.order_id is null or not exists (
    select 1 from public.orders o where o.id = v_snapshot.order_id
      and o.user_id = v_snapshot.user_id and o.payment_status = 'completed'
  ) then
    raise exception 'UK paid order not found';
  end if;
  if v_snapshot.notifications_created_at is not null then
    return;
  end if;
  insert into public.notifications (user_id, type, title, message, metadata)
  select recipients.user_id, 'order_placed', 'Order Placed Successfully',
    'Your order has been placed and is being processed.',
    jsonb_build_object('order_id', v_snapshot.order_id, 'order_number', v_snapshot.order_id)
  from (
    select v_snapshot.user_id as user_id
    union
    select oi.seller_id from public.order_items oi
      where oi.order_id = v_snapshot.order_id and oi.seller_id is not null
    union
    select p.id from public.profiles p where p.role = 'admin'
  ) recipients;
  update public.uk_hosted_checkout_sessions
    set notifications_created_at = now(), updated_at = now()
    where id = p_snapshot_id;
end;
$$;

revoke all on function public.notify_uk_hosted_order(uuid) from public, anon, authenticated;
grant execute on function public.notify_uk_hosted_order(uuid) to service_role;

commit;
