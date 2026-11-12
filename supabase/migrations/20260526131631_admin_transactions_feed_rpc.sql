-- ════════════════════════════════════════════════════════════════
-- Admin Accounts → unified All Transactions feed (server-side)
--
-- Returns one row per financial event admin can see:
--   • orders         → 'Order Placed'      (credit, buyer paid)
--   • orders         → 'Order Cancellation' (debit, refund issued)
--   • manual_payouts → 'Seller Payout'     (debit, admin → seller)
--
-- Each row is returned in its ORIGINAL source currency. The client
-- converts to the admin's display currency using live FX rates.
--
-- Filter by [p_from, p_to] on the event's effective timestamp
-- (created_at for orders + payouts, cancelled_at for cancellations).
-- ════════════════════════════════════════════════════════════════

create or replace function public.get_admin_transactions(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  txn_id          text,
  txn_date        timestamptz,
  paid_by         text,
  purpose         text,
  amount          numeric,
  source_currency text,
  direction       text,         -- 'credit' | 'debit'
  transaction_id  text,
  source          text          -- 'order' | 'cancellation' | 'payout'
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin-only
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'forbidden: admin role required';
  end if;

  return query
  -- 1. Order placed (credit) — only paid orders
  select
    ('order-' || o.id::text)                                          as txn_id,
    o.created_at                                                       as txn_date,
    coalesce(
      nullif(o.shipping_address->>'full_name', ''),
      p.full_name,
      'Buyer'
    )                                                                  as paid_by,
    'Order Placed'                                                     as purpose,
    coalesce(o.total_amount, 0)                                        as amount,
    coalesce(o.currency, 'INR')                                        as source_currency,
    'credit'                                                           as direction,
    coalesce(o.payment_intent_id, '-')                                 as transaction_id,
    'order'                                                            as source
  from public.orders o
  left join public.profiles p on p.id = o.user_id
  where o.created_at between p_from and p_to
    and lower(coalesce(o.payment_status, '')) in ('paid','completed','succeeded')

  union all

  -- 2. Order cancellation (debit) — only when the order was actually paid
  select
    ('cancel-' || o.id::text),
    o.cancelled_at,
    'BZEAD Admin',
    'Order Cancellation',
    coalesce(o.total_amount, 0),
    coalesce(o.currency, 'INR'),
    'debit',
    coalesce(o.payment_intent_id, '-'),
    'cancellation'
  from public.orders o
  where o.cancelled_at is not null
    and o.cancelled_at between p_from and p_to
    and lower(coalesce(o.payment_status, '')) in ('paid','completed','succeeded')

  union all

  -- 3. Manual payout to seller (debit, admin → seller)
  select
    ('payout-' || mp.id::text),
    mp.created_at,
    'BZEAD Admin',
    'Seller Payout' || case
      when sp.full_name is not null and sp.full_name <> '' then ' — ' || sp.full_name
      else ''
    end,
    coalesce(mp.amount, 0),
    coalesce(mp.currency, 'INR'),
    'debit',
    coalesce(mp.transaction_no, '-'),
    'payout'
  from public.manual_payouts mp
  left join public.profiles sp on sp.id = mp.seller_id
  where mp.created_at between p_from and p_to

  order by txn_date desc;
end;
$$;

grant execute on function public.get_admin_transactions(timestamptz, timestamptz) to authenticated;

comment on function public.get_admin_transactions(timestamptz, timestamptz) is
  'Admin-only unified transactions feed (orders + cancellations + manual payouts) in source currency.';
