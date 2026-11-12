begin;

create or replace function public.recover_paid_order_from_snapshot(
  p_payment_intent_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot record;
  v_rpc jsonb;
  v_result jsonb;
  v_expected_delivery_date_raw text;
  v_expected_delivery_date timestamptz;
  v_shipping_address jsonb;
  v_billing_address jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  if p_payment_intent_id is null or trim(p_payment_intent_id) = '' then
    raise exception 'payment_intent_id is required';
  end if;

  select *
  into v_snapshot
  from public.checkout_payment_snapshots
  where payment_intent_id = trim(p_payment_intent_id)
  limit 1;

  if v_snapshot is null then
    raise exception 'Checkout snapshot not found for payment_intent_id: %', p_payment_intent_id;
  end if;

  v_rpc := coalesce(v_snapshot.rpc_params, '{}'::jsonb);

  v_expected_delivery_date_raw := nullif(v_rpc->>'p_expected_delivery_date', '');
  v_expected_delivery_date := null;

  if v_expected_delivery_date_raw is not null then
    begin
      v_expected_delivery_date := v_expected_delivery_date_raw::timestamptz;
    exception
      when others then
        v_expected_delivery_date := null;
    end;
  end if;

  v_shipping_address := case
    when jsonb_typeof(v_rpc->'p_shipping_address') = 'object' then v_rpc->'p_shipping_address'
    else null
  end;
  v_billing_address := case
    when jsonb_typeof(v_rpc->'p_billing_address') = 'object' then v_rpc->'p_billing_address'
    else null
  end;

  if v_shipping_address is not null then
    if v_shipping_address ? 'expected_delivery_date' then
      v_shipping_address := jsonb_set(v_shipping_address, '{expected_delivery_date}', to_jsonb(v_expected_delivery_date), true);
    end if;
    if v_shipping_address ? 'expectedDeliveryDate' then
      v_shipping_address := jsonb_set(v_shipping_address, '{expectedDeliveryDate}', to_jsonb(v_expected_delivery_date), true);
    end if;
  end if;

  perform set_config('request.jwt.claim.sub', v_snapshot.user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select public.create_order_secure(
    v_snapshot.user_id,
    coalesce(v_rpc->'p_items', '[]'::jsonb),
    v_shipping_address,
    v_billing_address,
    nullif(v_rpc->>'p_phone', ''),
    nullif(v_rpc->>'p_notes', ''),
    coalesce(nullif(v_rpc->>'p_payment_intent_id', ''), trim(p_payment_intent_id)),
    coalesce(nullif(v_rpc->>'p_payment_method', ''), 'card'),
    coalesce(nullif(v_rpc->>'p_payment_status', ''), 'completed'),
    coalesce(nullif(v_rpc->>'p_order_status', ''), 'processing'),
    coalesce(nullif(v_rpc->>'p_currency', ''), 'INR'),
    coalesce(nullif(v_rpc->>'p_shipping_charge', '')::numeric, 0),
    coalesce(nullif(v_rpc->>'p_actual_shipping_cost', '')::numeric, 0),
    coalesce(nullif(v_rpc->>'p_platform_shipping_margin', '')::numeric, 0),
    coalesce(nullif(v_rpc->>'p_fx_rate', '')::numeric, 1),
    coalesce(nullif(v_rpc->>'p_idempotency_key', ''), 'stripe_' || trim(p_payment_intent_id)),
    nullif(v_rpc->>'p_shipping_carrier', ''),
    nullif(v_rpc->>'p_shipping_service_level', ''),
    nullif(v_rpc->>'p_shipping_provider', ''),
    nullif(v_rpc->>'p_shipping_rate_id', ''),
    v_expected_delivery_date,
    nullif(v_rpc->>'p_expected_delivery_days', '')::integer,
    nullif(v_rpc->>'p_country', '')
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.recover_paid_order_from_snapshot(text) to service_role;

commit;