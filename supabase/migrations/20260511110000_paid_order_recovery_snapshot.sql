begin;

create table if not exists public.checkout_payment_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payment_intent_id text not null,
  rpc_params jsonb not null,
  recovery_status text not null default 'pending'
    check (recovery_status in ('pending', 'recovered', 'failed')),
  recovery_attempts integer not null default 0,
  recovered_order_id uuid null references public.orders(id) on delete set null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_checkout_payment_snapshots_payment_intent
  on public.checkout_payment_snapshots(payment_intent_id);

alter table public.checkout_payment_snapshots enable row level security;

grant select, insert, update on table public.checkout_payment_snapshots to authenticated;
grant select, insert, update, delete on table public.checkout_payment_snapshots to service_role;

create policy "checkout_payment_snapshots_select_own"
  on public.checkout_payment_snapshots for select
  using (auth.uid() = user_id);

create policy "checkout_payment_snapshots_insert_own"
  on public.checkout_payment_snapshots for insert
  with check (auth.uid() = user_id);

create policy "checkout_payment_snapshots_update_own"
  on public.checkout_payment_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

with ranked as (
  select
    id,
    row_number() over (
      partition by stripe_payment_intent_id
      order by created_at desc, id desc
    ) as rn
  from public.payment_intents
  where stripe_payment_intent_id is not null
)
delete from public.payment_intents p
using ranked r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists uq_payment_intents_stripe_payment_intent_id
  on public.payment_intents(stripe_payment_intent_id);

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

  perform set_config('request.jwt.claim.sub', v_snapshot.user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  select public.create_order_secure(
    v_snapshot.user_id,
    coalesce(v_rpc->'p_items', '[]'::jsonb),
    case when jsonb_typeof(v_rpc->'p_shipping_address') = 'object' then v_rpc->'p_shipping_address' else null end,
    case when jsonb_typeof(v_rpc->'p_billing_address') = 'object' then v_rpc->'p_billing_address' else null end,
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
    nullif(v_rpc->>'p_expected_delivery_date', '')::timestamptz,
    nullif(v_rpc->>'p_expected_delivery_days', '')::integer,
    nullif(v_rpc->>'p_country', '')
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.recover_paid_order_from_snapshot(text) to service_role;

commit;
