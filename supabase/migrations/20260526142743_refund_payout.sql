-- ════════════════════════════════════════════════════════════════
-- Phase 2: Stripe payout for accepted refund requests
--
-- Adds payout columns to refund_requests and an admin RPC that an
-- edge function calls AFTER a successful stripe.refunds.create(...).
-- A separate webhook handler keeps stripe_refund_status fresh as the
-- bank settlement progresses (pending → succeeded | failed | canceled).
-- ════════════════════════════════════════════════════════════════

-- Allow new status values
alter table public.refund_requests
  drop constraint if exists refund_requests_status_check;

alter table public.refund_requests
  add constraint refund_requests_status_check
  check (status in ('requested','accepted','rejected','paid','failed'));

-- Payout columns
alter table public.refund_requests
  add column if not exists stripe_refund_id     text unique,
  add column if not exists stripe_refund_status text,
  add column if not exists stripe_failure_reason text,
  add column if not exists paid_at              timestamptz,
  add column if not exists paid_by              uuid references auth.users(id);

create index if not exists refund_requests_stripe_refund_id_idx
  on public.refund_requests (stripe_refund_id);

-- ════════════════════════════════════════════════════════════════
-- get_admin_refund_requests — extended with payout columns
-- ════════════════════════════════════════════════════════════════
drop function if exists public.get_admin_refund_requests(text);
create or replace function public.get_admin_refund_requests(
  p_status text default null
)
returns table (
  id                  uuid,
  refund_number       text,
  order_id            uuid,
  order_number        text,
  payment_intent_id   text,
  buyer_name          text,
  buyer_email         text,
  amount              numeric,
  currency            text,
  reason              text,
  status              text,
  admin_note          text,
  stripe_refund_id    text,
  stripe_refund_status text,
  stripe_failure_reason text,
  requested_at        timestamptz,
  reviewed_at         timestamptz,
  paid_at             timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden: admin role required';
  end if;

  return query
  select
    r.id,
    r.refund_number,
    r.order_id,
    o.order_number,
    o.payment_intent_id,
    coalesce(nullif(o.shipping_address->>'full_name',''), p.full_name, 'Buyer') as buyer_name,
    p.email as buyer_email,
    r.amount,
    r.currency,
    r.reason,
    r.status,
    r.admin_note,
    r.stripe_refund_id,
    r.stripe_refund_status,
    r.stripe_failure_reason,
    r.requested_at,
    r.reviewed_at,
    r.paid_at
  from public.refund_requests r
  join public.orders o on o.id = r.order_id
  left join public.profiles p on p.id = r.user_id
  where p_status is null or r.status = p_status
  order by r.requested_at desc;
end;
$$;

grant execute on function public.get_admin_refund_requests(text) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- get_user_refund_request — extended with payout columns
-- ════════════════════════════════════════════════════════════════
drop function if exists public.get_user_refund_request(uuid);
create or replace function public.get_user_refund_request(p_order_id uuid)
returns table (
  id                   uuid,
  refund_number        text,
  status               text,
  amount               numeric,
  currency             text,
  requested_at         timestamptz,
  reviewed_at          timestamptz,
  paid_at              timestamptz,
  admin_note           text,
  stripe_refund_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select r.id, r.refund_number, r.status, r.amount, r.currency,
         r.requested_at, r.reviewed_at, r.paid_at, r.admin_note, r.stripe_refund_status
  from public.refund_requests r
  join public.orders o on o.id = r.order_id
  where r.order_id = p_order_id
    and (o.user_id = v_uid or exists (
      select 1 from public.profiles where id = v_uid and role = 'admin'
    ));
end;
$$;

grant execute on function public.get_user_refund_request(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- admin_get_refund_payout_context — used by edge fn before calling Stripe.
-- Returns the data needed for stripe.refunds.create(...).
-- Admin-only; raises if not in 'accepted' state.
-- ════════════════════════════════════════════════════════════════
create or replace function public.admin_get_refund_payout_context(p_request_id uuid)
returns table (
  request_id        uuid,
  refund_number     text,
  order_id          uuid,
  payment_intent_id text,
  amount            numeric,
  currency          text,
  current_status    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'admin') then
    raise exception 'forbidden: admin role required';
  end if;

  return query
  select r.id, r.refund_number, r.order_id, o.payment_intent_id,
         r.amount, r.currency, r.status
  from public.refund_requests r
  join public.orders o on o.id = r.order_id
  where r.id = p_request_id;
end;
$$;

grant execute on function public.admin_get_refund_payout_context(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- admin_mark_refund_paid — called by edge fn after Stripe API call
-- ════════════════════════════════════════════════════════════════
create or replace function public.admin_mark_refund_paid(
  p_request_id          uuid,
  p_stripe_refund_id    text,
  p_stripe_refund_status text   -- 'pending' | 'succeeded' | 'failed' | 'canceled' | 'requires_action'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.profiles where id = v_uid and role = 'admin') then
    raise exception 'forbidden: admin role required';
  end if;

  update public.refund_requests
  set status               = case
                               when p_stripe_refund_status in ('failed','canceled') then 'failed'
                               else 'paid'
                             end,
      stripe_refund_id     = p_stripe_refund_id,
      stripe_refund_status = p_stripe_refund_status,
      paid_at              = case when paid_at is null then now() else paid_at end,
      paid_by              = coalesce(paid_by, v_uid)
  where refund_requests.id = p_request_id
    and refund_requests.status in ('accepted','failed');  -- allow retry after a failed payout

  if not found then
    raise exception 'refund request not found or not in a payable state';
  end if;
end;
$$;

grant execute on function public.admin_mark_refund_paid(uuid, text, text) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- stripe_webhook_update_refund_status — called by stripe-webhook fn
-- on refund.updated / charge.refunded events. NOT exposed to clients.
-- ════════════════════════════════════════════════════════════════
create or replace function public.stripe_webhook_update_refund_status(
  p_stripe_refund_id    text,
  p_stripe_refund_status text,
  p_failure_reason      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.refund_requests
  set stripe_refund_status = p_stripe_refund_status,
      stripe_failure_reason = nullif(trim(coalesce(p_failure_reason, '')), ''),
      status = case
                 when p_stripe_refund_status in ('failed','canceled') then 'failed'
                 when p_stripe_refund_status = 'succeeded' then 'paid'
                 else status
               end
  where stripe_refund_id = p_stripe_refund_id;
end;
$$;

revoke all on function public.stripe_webhook_update_refund_status(text, text, text) from public, anon, authenticated;
-- service_role bypasses these grants anyway; explicit revoke for safety.

comment on function public.admin_mark_refund_paid(uuid, text, text) is 'Called by refund-payment edge fn after stripe.refunds.create succeeds.';
comment on function public.stripe_webhook_update_refund_status(text, text, text) is 'Called by stripe-webhook on refund.updated/charge.refunded. Service-role only.';
