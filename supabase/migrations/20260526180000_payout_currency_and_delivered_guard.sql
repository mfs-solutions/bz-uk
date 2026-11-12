-- Seller Payout RPC v2: use the SELLER'S listing currency from products.currency
-- (not orders.currency — the order may be charged in buyer currency while the
-- seller listed in INR, causing a 100x inflation when re-converted).

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
      o.id                                        as order_id,
      o.order_number                              as order_number,
      o.created_at                                as order_date,
      o.status                                    as order_status,
      coalesce(oi.seller_id, o.seller_id)         as seller_id,
      -- seller's listing currency (fall back to order currency only if product was deleted)
      coalesce(pr.currency, o.currency, 'INR')    as line_currency,
      coalesce(pr.price, 0) * oi.quantity         as line_base_total,
      oi.id                                       as item_id
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
      ir.line_currency                       as currency,
      ir.seller_id,
      sum(ir.line_base_total)::numeric(14,2) as total_amount,
      count(ir.item_id)::bigint              as item_count
    from item_rollup ir
    where ir.seller_id is not null
    group by ir.order_id, ir.order_number, ir.order_date,
             ir.order_status, ir.line_currency, ir.seller_id
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
  'Admin payout report v2: groups by (order, seller, products.currency). Amount uses products.price in seller listing currency. Platform fee 9%.';

-- ════════════════════════════════════════════════════════════════
-- Guard: an order in `delivered` state cannot be downgraded by a
-- later stale shipment event. Prevents the bug that flipped Jissa's
-- order back to `cancelled` two days after a successful delivery.
-- ════════════════════════════════════════════════════════════════
create or replace function public.orders_prevent_delivered_downgrade()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'delivered'
     and new.status is distinct from 'delivered'
     and new.status in ('cancelled','canceled','in_transit','shipped',
                        'pending','out_for_delivery','failed_delivery',
                        'pickup_scheduled','rto_initiated') then
    raise notice 'orders_prevent_delivered_downgrade: blocked downgrade of order % from delivered to %',
      old.id, new.status;
    -- keep status as delivered; allow other column changes to proceed.
    new.status := 'delivered';
    new.completed_at := coalesce(old.completed_at, new.completed_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_prevent_delivered_downgrade on public.orders;
create trigger trg_orders_prevent_delivered_downgrade
before update of status on public.orders
for each row
execute function public.orders_prevent_delivered_downgrade();

comment on function public.orders_prevent_delivered_downgrade() is
  'Prevents an order that is already delivered from being flipped back to cancelled / in_transit etc. by a stale webhook or sibling cancelled shipment.';
