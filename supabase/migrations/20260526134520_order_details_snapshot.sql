-- ════════════════════════════════════════════════════════════════
-- Admin Accounts → Order Details snapshot
--
-- One frozen row per order, captured 1 minute AFTER the order is
-- placed (or immediately if it's already older when ingestion runs).
-- The locked fields (date, names, countries, amount, currency,
-- exchange_rate, markup_price) are written ONCE and never updated.
-- Only `status` is mutable so cancellations propagate.
--
-- pg_cron schedules `ingest_order_details_snapshots()` every minute.
-- Admin reads via `get_admin_order_details(p_from, p_to)`.
-- ════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

-- ─── Snapshot table ─────────────────────────────────────────────
create table if not exists public.order_details_snapshots (
  order_id        uuid primary key references public.orders(id) on delete cascade,
  order_number    text,
  order_date      timestamptz not null,
  buyer_name      text,
  buyer_country   text,
  seller_name     text,
  seller_country  text,
  order_amount    numeric,
  order_currency  text,
  exchange_rate   numeric,
  markup_price    numeric,
  markup_currency text,
  status          text not null check (status in ('PAID','CANCELLED')),
  snapshotted_at  timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists order_details_snapshots_order_date_idx
  on public.order_details_snapshots (order_date desc);
create index if not exists order_details_snapshots_status_idx
  on public.order_details_snapshots (status);

alter table public.order_details_snapshots enable row level security;

-- Admin-only read policy (writes happen via security-definer functions only)
drop policy if exists "admin read order_details_snapshots" on public.order_details_snapshots;
create policy "admin read order_details_snapshots"
  on public.order_details_snapshots
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ─── Helper: resolve country name from a profile id ─────────────
create or replace function public._profile_country_name(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(c.country_name, '-')
  from public.profiles p
  left join public.countries c on c.id = p.country_id
  where p.id = p_profile_id;
$$;

-- ─── Ingest function (every minute via pg_cron) ─────────────────
create or replace function public.ingest_order_details_snapshots()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Insert NEW snapshots: orders older than 1 minute, not yet snapshotted,
  --    that are either paid or cancelled.
  insert into public.order_details_snapshots (
    order_id, order_number, order_date,
    buyer_name, buyer_country,
    seller_name, seller_country,
    order_amount, order_currency,
    exchange_rate, markup_price, markup_currency,
    status
  )
  select
    o.id,
    o.order_number,
    o.created_at,
    coalesce(nullif(o.shipping_address->>'full_name', ''), bp.full_name, 'Buyer'),
    coalesce(
      nullif(o.shipping_address->>'country', ''),
      public._profile_country_name(o.user_id),
      '-'
    ),
    coalesce(sp.full_name, '-'),
    coalesce(public._profile_country_name(o.seller_id), '-'),
    coalesce(o.total_amount, 0),
    coalesce(o.currency, 'INR'),
    o.buyer_to_seller_fx_rate,
    o.platform_markup_total_inr,
    'INR',
    case
      when o.cancelled_at is not null then 'CANCELLED'
      else 'PAID'
    end
  from public.orders o
  left join public.profiles bp on bp.id = o.user_id
  left join public.profiles sp on sp.id = o.seller_id
  where o.created_at < (now() - interval '1 minute')
    and (
      lower(coalesce(o.payment_status, '')) in ('paid','completed','succeeded')
      or o.cancelled_at is not null
    )
    and not exists (
      select 1 from public.order_details_snapshots s where s.order_id = o.id
    );

  -- 2) Update STATUS only on existing snapshots (e.g. order cancelled later).
  update public.order_details_snapshots s
  set status = new_status,
      updated_at = now()
  from (
    select
      o.id as order_id,
      case
        when o.cancelled_at is not null then 'CANCELLED'
        else 'PAID'
      end as new_status
    from public.orders o
  ) src
  where s.order_id = src.order_id
    and s.status is distinct from src.new_status;
end;
$$;

grant execute on function public.ingest_order_details_snapshots() to postgres;

-- ─── Schedule the job every minute (idempotent) ─────────────────
do $$
begin
  -- Drop any previous schedule with the same name
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'order_details_snapshot_ingest';

  perform cron.schedule(
    'order_details_snapshot_ingest',
    '* * * * *',
    $cron$ select public.ingest_order_details_snapshots(); $cron$
  );
end$$;

-- Backfill once so existing paid/cancelled orders show up immediately.
select public.ingest_order_details_snapshots();

-- ─── Admin read RPC ─────────────────────────────────────────────
create or replace function public.get_admin_order_details(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  order_id        uuid,
  order_number    text,
  order_date      timestamptz,
  buyer_name      text,
  buyer_country   text,
  seller_name     text,
  seller_country  text,
  order_amount    numeric,
  order_currency  text,
  exchange_rate   numeric,
  markup_price    numeric,
  markup_currency text,
  status          text
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
    s.order_id, s.order_number, s.order_date,
    s.buyer_name, s.buyer_country,
    s.seller_name, s.seller_country,
    s.order_amount, s.order_currency,
    s.exchange_rate, s.markup_price, s.markup_currency,
    s.status
  from public.order_details_snapshots s
  where s.order_date between p_from and p_to
  order by s.order_date desc;
end;
$$;

grant execute on function public.get_admin_order_details(timestamptz, timestamptz) to authenticated;

comment on table public.order_details_snapshots is
  'Frozen per-order snapshot for the admin Order Details view. Only `status` is mutable; FX, names, countries, amounts captured at +1min after order creation.';
comment on function public.ingest_order_details_snapshots() is
  'Cron-driven ingestion: snapshots paid/cancelled orders older than 1 minute, and refreshes status on existing rows.';
comment on function public.get_admin_order_details(timestamptz, timestamptz) is
  'Admin-only read of the order_details_snapshots ledger, filtered by order_date.';
