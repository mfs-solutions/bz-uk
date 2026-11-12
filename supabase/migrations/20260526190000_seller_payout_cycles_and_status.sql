-- ════════════════════════════════════════════════════════════════
-- Seller Payout v3: cycle codes (MMM01YYYY / MMM02YYYY),
-- payout status tracking, and a "Process Payout" RPC.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.seller_payout_runs (
  id              uuid primary key default gen_random_uuid(),
  cycle_code      text not null,                          -- e.g. MAY012026 (May, 1st cycle, 2026)
  seller_id       uuid not null references public.profiles(id) on delete cascade,
  currency        text not null,
  period_start    timestamptz not null,
  period_end      timestamptz not null,
  total_amount    numeric(14,2) not null default 0,
  platform_charge numeric(14,2) not null default 0,
  net_payout      numeric(14,2) not null default 0,
  order_count     int not null default 0,
  status          text not null default 'paid' check (status in ('pending','paid')),
  paid_at         timestamptz,
  paid_by         uuid references public.profiles(id),
  note            text,
  created_at      timestamptz not null default now(),
  unique (cycle_code, seller_id, currency)
);

alter table public.seller_payout_runs enable row level security;

drop policy if exists "admin_read_payout_runs"  on public.seller_payout_runs;
drop policy if exists "admin_write_payout_runs" on public.seller_payout_runs;

create policy "admin_read_payout_runs" on public.seller_payout_runs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
create policy "admin_write_payout_runs" on public.seller_payout_runs
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  ) with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

grant select, insert, update on public.seller_payout_runs to authenticated;

-- ── helper: derive cycle_code from a period_start timestamptz ──────
create or replace function public.payout_cycle_code(p_period_start timestamptz)
returns text
language sql
immutable
as $$
  select upper(to_char(p_period_start, 'Mon'))
      || case when extract(day from p_period_start) = 1 then '01' else '02' end
      || to_char(p_period_start, 'YYYY');
$$;

-- ── v3: admin_get_seller_payouts now exposes cycle_code & payout_status ──
drop function if exists public.admin_get_seller_payouts(timestamptz, timestamptz);
create or replace function public.admin_get_seller_payouts(
  p_period_start timestamptz,
  p_period_end   timestamptz
)
returns table (
  cycle_code      text,
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
  item_count      bigint,
  payout_status   text,
  paid_at         timestamptz
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
  with item_rollup as (
    select
      o.id                                        as order_id,
      o.order_number                              as order_number,
      o.created_at                                as order_date,
      o.status                                    as order_status,
      coalesce(oi.seller_id, o.seller_id)         as seller_id,
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
    coalesce(pr.status, 'pending')                         as payout_status,
    pr.paid_at                                             as paid_at
  from grouped g
  left join public.profiles sp on sp.id = g.seller_id
  left join public.seller_payout_runs pr
         on pr.cycle_code = v_cycle
        and pr.seller_id  = g.seller_id
        and pr.currency   = g.currency
  order by g.order_date desc, g.order_number;
end;
$$;

grant execute on function public.admin_get_seller_payouts(timestamptz, timestamptz) to authenticated;

-- ── Process Payout: mark all items for a (cycle, seller, currency) as paid ──
create or replace function public.admin_mark_seller_payout_paid(
  p_cycle_code     text,
  p_seller_id      uuid,
  p_currency       text,
  p_period_start   timestamptz,
  p_period_end     timestamptz,
  p_total_amount   numeric,
  p_platform_charge numeric,
  p_net_payout     numeric,
  p_order_count    int,
  p_note           text default null
)
returns public.seller_payout_runs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.seller_payout_runs%rowtype;
begin
  if not exists (
    select 1 from public.profiles p2
    where p2.id = auth.uid() and p2.role = 'admin'
  ) then
    raise exception 'forbidden: admin role required';
  end if;

  insert into public.seller_payout_runs as r (
    cycle_code, seller_id, currency, period_start, period_end,
    total_amount, platform_charge, net_payout, order_count,
    status, paid_at, paid_by, note
  ) values (
    p_cycle_code, p_seller_id, p_currency, p_period_start, p_period_end,
    p_total_amount, p_platform_charge, p_net_payout, p_order_count,
    'paid', now(), auth.uid(), p_note
  )
  on conflict (cycle_code, seller_id, currency) do update
    set total_amount    = excluded.total_amount,
        platform_charge = excluded.platform_charge,
        net_payout      = excluded.net_payout,
        order_count     = excluded.order_count,
        period_start    = excluded.period_start,
        period_end      = excluded.period_end,
        status          = 'paid',
        paid_at         = coalesce(r.paid_at, now()),
        paid_by         = coalesce(r.paid_by, auth.uid()),
        note            = coalesce(excluded.note, r.note)
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_mark_seller_payout_paid(
  text, uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, int, text
) to authenticated;

comment on table public.seller_payout_runs is 'One row per (cycle_code, seller, currency). status=paid means admin clicked Process Payout.';
comment on function public.admin_get_seller_payouts(timestamptz, timestamptz) is 'Admin payout report v3: returns cycle_code and payout_status (pending|paid) per row.';
comment on function public.admin_mark_seller_payout_paid(text, uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, int, text) is 'Admin-only: marks a (cycle, seller, currency) bucket as paid in seller_payout_runs.';
