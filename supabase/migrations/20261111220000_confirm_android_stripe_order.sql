begin;

create or replace function public.confirm_android_stripe_order(
  p_user_id uuid,
  p_payment_intent_id text,
  p_amount_pence bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot public.checkout_payment_snapshots%rowtype;
  v_order public.orders%rowtype;
  v_result jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;
  if p_user_id is null or p_payment_intent_id is null or p_payment_intent_id !~ '^pi_[A-Za-z0-9]+$'
     or p_amount_pence is null or p_amount_pence <= 0 then
    raise exception 'Invalid payment details';
  end if;

  select * into v_snapshot
  from public.checkout_payment_snapshots
  where payment_intent_id = p_payment_intent_id
  for update;
  if not found or v_snapshot.user_id <> p_user_id
     or v_snapshot.rpc_params->>'p_user_id' is distinct from p_user_id::text
     or v_snapshot.rpc_params->>'p_payment_intent_id' is distinct from p_payment_intent_id
     or upper(coalesce(v_snapshot.rpc_params->>'p_currency', '')) <> 'GBP'
     or v_snapshot.rpc_params->>'p_payment_method' is distinct from 'card'
     or regexp_replace(upper(coalesce(v_snapshot.rpc_params->>'p_country', '')), '\s+', '', 'g')
        not in ('GB', 'GBR', 'UK', 'UNITEDKINGDOM')
     or v_snapshot.rpc_params->>'p_idempotency_key' is distinct from 'stripe_' || p_payment_intent_id then
    raise exception 'Payment recovery snapshot does not match';
  end if;
  if jsonb_typeof(v_snapshot.rpc_params->'p_items') is distinct from 'array'
     or jsonb_array_length(v_snapshot.rpc_params->'p_items') = 0 then
    raise exception 'Payment recovery items are invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_snapshot.rpc_params->'p_items') item
    where jsonb_typeof(item) <> 'object'
       or coalesce(item->>'quantity', '') !~ '^[1-9][0-9]{0,5}$'
       or coalesce(item->>'product_id', '') = ''
  ) or coalesce((v_snapshot.rpc_params->>'p_shipping_charge')::numeric, -1) < 0 then
    raise exception 'Payment recovery items or shipping charge are invalid';
  end if;

  select * into v_order from public.orders
  where idempotency_key = 'stripe_' || p_payment_intent_id
  for update;
  if not found then
    v_result := public.recover_paid_order_from_snapshot(p_payment_intent_id);
    select * into v_order from public.orders
    where id = (v_result->>'id')::uuid
    for update;
  end if;

  if v_order.id is null or v_order.user_id is distinct from p_user_id
     or v_order.payment_intent_id is distinct from p_payment_intent_id
     or v_order.payment_method is distinct from 'card'
     or upper(coalesce(v_order.currency, '')) <> 'GBP'
     or v_order.total_amount is null
     or v_order.total_amount * 100 <> p_amount_pence
     or lower(coalesce(v_order.status, '')) in ('cancelled', 'canceled')
     or lower(coalesce(v_order.payment_status, '')) not in ('pending', 'completed', 'paid', 'succeeded') then
    raise exception 'Order does not match the confirmed payment';
  end if;

  update public.orders set payment_status = 'completed', updated_at = now()
  where id = v_order.id and payment_status <> 'completed';

  insert into public.payment_intents (order_id, stripe_payment_intent_id, status, amount, currency)
  values (v_order.id, p_payment_intent_id, 'succeeded', p_amount_pence::numeric / 100, 'gbp')
  on conflict (stripe_payment_intent_id) do nothing;
  if not exists (
    select 1 from public.payment_intents
    where stripe_payment_intent_id = p_payment_intent_id
      and order_id = v_order.id and amount = p_amount_pence::numeric / 100
      and lower(currency) = 'gbp'
  ) then
    raise exception 'Payment record does not match the confirmed order';
  end if;
  update public.payment_intents set status = 'succeeded'
  where stripe_payment_intent_id = p_payment_intent_id and status is distinct from 'succeeded';

  update public.checkout_payment_snapshots
  set recovery_status = 'recovered', recovered_order_id = v_order.id,
      last_error = null, updated_at = now()
  where id = v_snapshot.id;

  return jsonb_build_object('id', v_order.id);
end;
$$;

revoke all on function public.confirm_android_stripe_order(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.confirm_android_stripe_order(uuid, text, bigint) to service_role;

commit;
