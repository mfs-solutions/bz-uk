-- ════════════════════════════════════════════════════════════════
-- Seller Payout v4 — accounting correctness audit
-- ════════════════════════════════════════════════════════════════
--
-- Findings being addressed:
--   1. RPC was bucketing orders by o.created_at, but a seller must be paid
--      based on when the order was actually delivered (o.completed_at).
--      e.g. order placed Mar 29 / delivered Apr 21 must appear in APR022026,
--      not MAR022026 where it wasn't yet delivered.
--   2. Fully-refunded orders (refund_requests.status='paid') were still being
--      paid to sellers. Exclude any order with a successful refund.
--   3. Surface a "stale" flag when the stored seller_payout_runs total drifts
--      from the live recomputed total (e.g. a delivery webhook arrived after
--      the admin already clicked Process Payout for that cycle).
--
-- Fallback for legacy rows: orders with status='delivered' but completed_at
-- IS NULL fall back to updated_at, then created_at, so nothing disappears.

drop function if exists public.admin_get_seller_payouts(timestamptz, timestamptz);
create or replace function public.admin_get_seller_payouts(
  p_period_start timestamptz,
  p_period_end   timestamptz
)
returns table (
  cycle_code        text,
  order_id          uuid,
  order_number      text,
  order_date        timestamptz,     -- the date used for bucketing (delivered_at)
  order_status      text,
  currency          text,
  seller_id         uuid,
  seller_name       text,
  seller_email      text,
  total_amount      numeric,
  platform_charge   numeric,
  net_payout        numeric,
  item_count        bigint,
  payout_status     text,
  paid_at           timestamptz,
  is_stale          boolean         -- true if stored run total != live computed total
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle text := public.payout_cycle_code(p_period_start);
begin
  if not exists (
    select 1 from public.profiles p2
    where p2.id = auth.uid() and p2.role = 'admin'
  ) then
    raise exception 'forbidden: admin role required';
  end if;

  return query
  with delivered_orders as (
    select
      o.id,
      o.order_number,
      o.status,
      o.currency as order_currency,
      o.seller_id as order_seller_id,
      coalesce(o.completed_at, o.updated_at, o.created_at) as delivered_at
    from public.orders o
    where o.status = 'delivered'
      and coalesce(o.completed_at, o.updated_at, o.created_at) >= p_period_start
      and coalesce(o.completed_at, o.updated_at, o.created_at) <  p_period_end
      -- Exclude orders that have been fully refunded via Stripe.
      and not exists (
        select 1 from public.refund_requests rr
        where rr.order_id = o.id and rr.status = 'paid'
      )
  ),
  item_rollup as (
    select
      d.id                                        as order_id,
      d.order_number                              as order_number,
      d.delivered_at                              as order_date,
      d.status                                    as order_status,
      coalesce(oi.seller_id, d.order_seller_id)   as seller_id,
      coalesce(pr.currency, d.order_currency, 'INR') as line_currency,
      coalesce(pr.price, 0) * oi.quantity         as line_base_total,
      oi.id                                       as item_id
    from delivered_orders d
    join public.order_items oi on oi.order_id = d.id
    left join public.products pr on pr.id = oi.product_id
  ),
  grouped as (
    select
      ir.order_id,
      ir.order_number,
      ir.order_date,
      ir.order_status,
      ir.line_currency                       as currency,
      ir.seller_id,
      sum(ir.line_base_total)::numeric(14,2) as total_amount,
      count(ir.item_id)::bigint              as item_count
    from item_rollup ir
    where ir.seller_id is not null
    group by ir.order_id, ir.order_number, ir.order_date,
             ir.order_status, ir.line_currency, ir.seller_id
  ),
  bucket_totals as (
    -- Sum live totals per (seller, currency) for the cycle, to compare
    -- against any previously-processed seller_payout_runs row.
    select g.seller_id, g.currency, sum(g.total_amount)::numeric(14,2) as live_total
    from grouped g
    group by g.seller_id, g.currency
  )
  select
    v_cycle                                                as cycle_code,
    g.order_id,
    g.order_number,
    g.order_date,
    g.order_status,
    g.currency,
    g.seller_id,
    coalesce(nullif(sp.full_name, ''), sp.email, 'Seller') as seller_name,
    sp.email                                                as seller_email,
    g.total_amount,
    round(g.total_amount * 0.09, 2)                        as platform_charge,
    round(g.total_amount * 0.91, 2)                        as net_payout,
    g.item_count,
    coalesce(rn.status, 'pending')                         as payout_status,
    rn.paid_at                                             as paid_at,
    (rn.status = 'paid'
       and rn.total_amount is distinct from bt.live_total) as is_stale
  from grouped g
  left join public.profiles sp on sp.id = g.seller_id
  left join bucket_totals bt
         on bt.seller_id = g.seller_id and bt.currency = g.currency
  left join public.seller_payout_runs rn
         on rn.cycle_code = v_cycle
        and rn.seller_id  = g.seller_id
        and rn.currency   = g.currency
  order by g.order_date desc, g.order_number;
end;
$$;

grant execute on function public.admin_get_seller_payouts(timestamptz, timestamptz) to authenticated;

comment on function public.admin_get_seller_payouts(timestamptz, timestamptz) is
  'Admin payout report v4: buckets by completed_at (delivery date), excludes refunded orders, surfaces is_stale flag when a paid bucket no longer matches live totals.';

-- Helpful index for the new completed_at-based filter
create index if not exists idx_orders_completed_at_delivered
  on public.orders (completed_at)
  where status = 'delivered';
