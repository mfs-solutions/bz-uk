-- ════════════════════════════════════════════════════════════════
-- Seller Payout report — admin-only RPC.
--
-- Payout cycles: 1st and 15th of every month.
-- Only DELIVERED orders are listed.
-- "total_amount" uses BASE seller price from products.price (NOT what
-- the buyer actually paid — order_items.price may include platform
-- markup). Platform charge = 9% of total_amount.
-- ════════════════════════════════════════════════════════════════

drop function if exists public.admin_get_seller_payouts(timestamptz, timestamptz);
create or replace function public.admin_get_seller_payouts(
  p_period_start timestamptz,
  p_period_end   timestamptz
)
returns table (
  order_id        uuid,
  order_number    text,
  order_date      timestamptz,
  order_status    text,
  currency        text,
  seller_id       uuid,
  seller_name     text,
  seller_email    text,
  total_amount    numeric,
  platform_charge numeric,
  net_payout      numeric,
  item_count      bigint
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
  with item_rollup as (
    select
      o.id                                  as order_id,
      o.order_number                        as order_number,
      o.created_at                          as order_date,
      o.status                              as order_status,
      o.currency                            as currency,
      -- seller is taken from order_items (each item is authored by a
      -- seller); fall back to orders.seller_id for legacy rows.
      coalesce(oi.seller_id, o.seller_id)   as seller_id,
      -- base sell price from products table × quantity
      coalesce(pr.price, 0) * oi.quantity   as line_base_total,
      oi.id                                 as item_id
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    left join public.products pr on pr.id = oi.product_id
    where o.status = 'delivered'
      and o.created_at >= p_period_start
      and o.created_at <  p_period_end
  ),
  grouped as (
    select
      ir.order_id,
      ir.order_number,
      ir.order_date,
      ir.order_status,
      ir.currency,
      ir.seller_id,
      sum(ir.line_base_total)::numeric(14,2) as total_amount,
      count(ir.item_id)::bigint              as item_count
    from item_rollup ir
    where ir.seller_id is not null
    group by ir.order_id, ir.order_number, ir.order_date,
             ir.order_status, ir.currency, ir.seller_id
  )
  select
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
    g.item_count
  from grouped g
  left join public.profiles sp on sp.id = g.seller_id
  order by g.order_date desc, g.order_number;
end;
$$;

grant execute on function public.admin_get_seller_payouts(timestamptz, timestamptz) to authenticated;

comment on function public.admin_get_seller_payouts(timestamptz, timestamptz) is
  'Admin payout report: delivered orders in [start, end). Amount uses products.price (base seller price). Platform fee 9%.';
