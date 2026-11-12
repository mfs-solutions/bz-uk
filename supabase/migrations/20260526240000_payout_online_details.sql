-- ─────────────────────────────────────────────────────────────────────────────
-- Phase-2 Seller Payout — Online payment details + partial payment support.
--
-- New columns on seller_payout_runs:
--   online_method   text   — 'upi' | 'account_transfer' (only when payment_method='online')
--   transaction_id  text   — bank/UPI reference id (required when payment_method='online')
--   is_partial      bool   — true if this run paid less than net_payout
--   paid_amount     numeric— actual amount paid (defaults to net_payout when not partial)
--
-- Status now allows a third value 'partial' so the UI can still let admin top-up.
-- admin_mark_seller_payout_paid gains optional params and enforces validation.
-- get_seller_payout_orders is rebuilt to keep cycle/refund/stale logic and surface 'partial'.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.seller_payout_runs
  add column if not exists online_method  text,
  add column if not exists transaction_id text,
  add column if not exists is_partial     boolean not null default false,
  add column if not exists paid_amount    numeric(14,2);

-- Expand status check constraint to include 'partial'.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'seller_payout_runs_status_check'
      and conrelid = 'public.seller_payout_runs'::regclass
  ) then
    alter table public.seller_payout_runs drop constraint seller_payout_runs_status_check;
  end if;
end$$;

alter table public.seller_payout_runs
  add constraint seller_payout_runs_status_check
  check (status in ('pending','paid','partial'));

-- Online-method check (nullable; only required when payment_method='online')
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'seller_payout_runs_online_method_check'
      and conrelid = 'public.seller_payout_runs'::regclass
  ) then
    alter table public.seller_payout_runs drop constraint seller_payout_runs_online_method_check;
  end if;
end$$;

alter table public.seller_payout_runs
  add constraint seller_payout_runs_online_method_check
  check (online_method is null or online_method in ('upi','account_transfer'));

-- Drop the old (post-payment_method) signature before recreating.
drop function if exists public.admin_mark_seller_payout_paid(
  text, uuid, text, timestamptz, timestamptz,
  numeric, numeric, numeric, int, text, text
);

create or replace function public.admin_mark_seller_payout_paid(
  p_cycle_code      text,
  p_seller_id       uuid,
  p_currency        text,
  p_period_start    timestamptz,
  p_period_end      timestamptz,
  p_total_amount    numeric,
  p_platform_charge numeric,
  p_net_payout      numeric,
  p_order_count     int,
  p_payment_method  text,
  p_online_method   text     default null,
  p_transaction_id  text     default null,
  p_is_partial      boolean  default false,
  p_paid_amount     numeric  default null,
  p_note            text     default null
)
returns public.seller_payout_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin   boolean;
  v_status  text;
  v_paid    numeric(14,2);
  v_row     public.seller_payout_runs;
begin
  -- Admin gate.
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  ) into v_admin;
  if not v_admin then
    raise exception 'only admins may mark payouts paid';
  end if;

  -- Validate payment method.
  if p_payment_method is null or p_payment_method not in ('stripe','online') then
    raise exception 'invalid payment_method: must be stripe or online';
  end if;

  -- Validate online sub-fields.
  if p_payment_method = 'online' then
    if p_online_method is null or p_online_method not in ('upi','account_transfer') then
      raise exception 'online payment requires online_method (upi or account_transfer)';
    end if;
    if p_transaction_id is null or length(btrim(p_transaction_id)) = 0 then
      raise exception 'online payment requires a transaction_id';
    end if;
  end if;

  -- Resolve paid amount + status.
  if coalesce(p_is_partial, false) then
    if p_paid_amount is null or p_paid_amount <= 0 then
      raise exception 'partial payment requires paid_amount > 0';
    end if;
    if p_paid_amount >= p_net_payout then
      raise exception 'partial paid_amount must be less than net_payout (% < %)',
        p_paid_amount, p_net_payout;
    end if;
    v_status := 'partial';
    v_paid   := round(p_paid_amount::numeric, 2);
  else
    v_status := 'paid';
    v_paid   := round(p_net_payout::numeric, 2);
  end if;

  insert into public.seller_payout_runs (
    cycle_code, seller_id, currency, period_start, period_end,
    total_amount, platform_charge, net_payout, order_count,
    status, paid_at, paid_by,
    payment_method, online_method, transaction_id, is_partial, paid_amount,
    note
  ) values (
    p_cycle_code, p_seller_id, p_currency, p_period_start, p_period_end,
    p_total_amount, p_platform_charge, p_net_payout, p_order_count,
    v_status, now(), auth.uid(),
    p_payment_method,
    case when p_payment_method = 'online' then p_online_method end,
    case when p_payment_method = 'online' then btrim(p_transaction_id) end,
    coalesce(p_is_partial, false), v_paid,
    p_note
  )
  on conflict (cycle_code, seller_id, currency) do update
    set period_start    = excluded.period_start,
        period_end      = excluded.period_end,
        total_amount    = excluded.total_amount,
        platform_charge = excluded.platform_charge,
        net_payout      = excluded.net_payout,
        order_count     = excluded.order_count,
        status          = excluded.status,
        paid_at         = excluded.paid_at,
        paid_by         = excluded.paid_by,
        payment_method  = excluded.payment_method,
        online_method   = excluded.online_method,
        transaction_id  = excluded.transaction_id,
        is_partial      = excluded.is_partial,
        paid_amount     = excluded.paid_amount,
        note            = excluded.note
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_mark_seller_payout_paid(
  text, uuid, text, timestamptz, timestamptz,
  numeric, numeric, numeric, int, text, text, text, boolean, numeric, text
) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rebuild get_seller_payout_orders so payout_status surfaces 'partial' too and
-- is_stale fires when paid amount drifts from the live net total.
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.get_seller_payout_orders(timestamptz, timestamptz);

create or replace function public.get_seller_payout_orders(
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
  item_count        int,
  payout_status     text,
  paid_at           timestamptz,
  is_stale          boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin boolean;
begin
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','super_admin')
  ) into v_admin;
  if not v_admin then
    raise exception 'only admins may view seller payouts';
  end if;

  return query
  with item_rows as (
    select
      o.id                                                                as order_id,
      o.order_number,
      coalesce(o.completed_at, o.updated_at, o.created_at)                as order_date,
      o.status                                                            as order_status,
      o.id                                                                as join_oid,
      oi.id                                                               as item_id,
      oi.quantity                                                         as qty,
      coalesce(oi.price, p.price, 0)                                      as unit_price,
      coalesce(p.currency, o.currency)                                    as line_currency,
      p.seller_id                                                         as seller_id,
      case
        when extract(day from coalesce(o.completed_at, o.updated_at, o.created_at) at time zone 'UTC') < 15
          then date_trunc('month', coalesce(o.completed_at, o.updated_at, o.created_at) at time zone 'UTC')::timestamptz
        else (date_trunc('month', coalesce(o.completed_at, o.updated_at, o.created_at) at time zone 'UTC') + interval '14 days')::timestamptz
      end                                                                 as cycle_start
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    join public.products p     on p.id = oi.product_id
    where o.status = 'delivered'
      and coalesce(o.completed_at, o.updated_at, o.created_at) >= p_period_start
      and coalesce(o.completed_at, o.updated_at, o.created_at) <  p_period_end
      and p.seller_id is not null
      and not exists (
        select 1 from public.refund_requests rr
        where rr.order_id = o.id and rr.status = 'paid'
      )
  ),
  grouped as (
    select ir.order_id, ir.order_number, ir.order_date, ir.order_status,
           ir.line_currency as currency, ir.seller_id, ir.cycle_start,
           sum(ir.qty * ir.unit_price)::numeric(14,2) as total_amount,
           sum(ir.qty)::int                            as item_count
    from item_rows ir
    group by ir.order_id, ir.order_number, ir.order_date,
             ir.order_status, ir.line_currency, ir.seller_id, ir.cycle_start
  ),
  bucket_totals as (
    select g.seller_id, g.currency, g.cycle_start,
           sum(g.total_amount)::numeric(14,2) as live_total,
           round(sum(g.total_amount) * 0.91, 2)::numeric(14,2) as live_net
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
    -- Stale if marked paid but live total drifted, OR partial with live_net changed.
    (
      (rn.status = 'paid'    and rn.total_amount is distinct from bt.live_total)
      or
      (rn.status = 'partial' and coalesce(rn.paid_amount, 0) < bt.live_net)
    )                                                       as is_stale
  from grouped g
  left join public.profiles sp on sp.id = g.seller_id
  left join bucket_totals bt
         on bt.seller_id   = g.seller_id
        and bt.currency    = g.currency
        and bt.cycle_start = g.cycle_start
  left join public.seller_payout_runs rn
         on rn.cycle_code = public.payout_cycle_code(g.cycle_start)
        and rn.seller_id  = g.seller_id
        and rn.currency   = g.currency
  order by g.order_date desc, g.order_number;
end;
$$;

grant execute on function public.get_seller_payout_orders(timestamptz, timestamptz) to authenticated;
