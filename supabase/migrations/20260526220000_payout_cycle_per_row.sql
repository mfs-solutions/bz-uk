-- Compute cycle_code from each row's actual delivery date, not from the
-- caller's p_period_start. Makes the RPC correct for any range, including
-- a year-wide audit query. No behaviour change for the 14-day UI calls.

drop function if exists public.admin_get_seller_payouts(timestamptz, timestamptz);
create or replace function public.admin_get_seller_payouts(
  p_period_start timestamptz,
  p_period_end   timestamptz
)
returns table (
  cycle_code        text,
  order_id          uuid,
  order_number      text,
  order_date        timestamptz,
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
  is_stale          boolean
)
language plpgsql
security definer
set search_path = public
as $$
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
      count(ir.item_id)::bigint              as item_count,
      -- Bucket boundary that *contains* delivered_at, in UTC.
      case
        when extract(day from (ir.order_date at time zone 'UTC')) < 15
          then date_trunc('month', ir.order_date at time zone 'UTC') at time zone 'UTC'
        else (date_trunc('month', ir.order_date at time zone 'UTC') + interval '14 days') at time zone 'UTC'
      end as cycle_start
    from item_rollup ir
    where ir.seller_id is not null
    group by ir.order_id, ir.order_number, ir.order_date,
             ir.order_status, ir.line_currency, ir.seller_id
  ),
  bucket_totals as (
    select g.seller_id, g.currency, g.cycle_start,
           sum(g.total_amount)::numeric(14,2) as live_total
    from grouped g
    group by g.seller_id, g.currency, g.cycle_start
  )
  select
    public.payout_cycle_code(g.cycle_start)                as cycle_code,
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
         on bt.seller_id  = g.seller_id
        and bt.currency   = g.currency
        and bt.cycle_start = g.cycle_start
  left join public.seller_payout_runs rn
         on rn.cycle_code = public.payout_cycle_code(g.cycle_start)
        and rn.seller_id  = g.seller_id
        and rn.currency   = g.currency
  order by g.order_date desc, g.order_number;
end;
$$;

grant execute on function public.admin_get_seller_payouts(timestamptz, timestamptz) to authenticated;

comment on function public.admin_get_seller_payouts(timestamptz, timestamptz) is
  'Admin payout report v5: cycle_code is computed per-row from each delivery date, not from the caller p_period_start. Correct for any range.';
