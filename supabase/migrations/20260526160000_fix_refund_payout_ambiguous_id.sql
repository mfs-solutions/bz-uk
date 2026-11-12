-- Fix "column reference 'id' is ambiguous" — OUT-table column `id` collides
-- with `profiles.id` inside the admin gate. Qualify `profiles.id` everywhere.

-- ─── get_admin_refund_requests ─────────────────────────────────────────────
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
    select 1 from public.profiles p2 where p2.id = auth.uid() and p2.role = 'admin'
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

-- ─── admin_get_refund_payout_context ───────────────────────────────────────
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
  if not exists (
    select 1 from public.profiles p2 where p2.id = v_uid and p2.role = 'admin'
  ) then
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

-- ─── admin_mark_refund_paid ────────────────────────────────────────────────
create or replace function public.admin_mark_refund_paid(
  p_request_id          uuid,
  p_stripe_refund_id    text,
  p_stripe_refund_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles p2 where p2.id = v_uid and p2.role = 'admin'
  ) then
    raise exception 'forbidden: admin role required';
  end if;

  update public.refund_requests
  set status               = case
                               when p_stripe_refund_status in ('failed','canceled') then 'failed'
                               else 'paid'
                             end,
      stripe_refund_id     = p_stripe_refund_id,
      stripe_refund_status = p_stripe_refund_status,
      paid_at              = case when refund_requests.paid_at is null then now() else refund_requests.paid_at end,
      paid_by              = coalesce(refund_requests.paid_by, v_uid)
  where refund_requests.id = p_request_id
    and refund_requests.status in ('accepted','failed');

  if not found then
    raise exception 'refund request not found or not in a payable state';
  end if;
end;
$$;

grant execute on function public.admin_mark_refund_paid(uuid, text, text) to authenticated;
