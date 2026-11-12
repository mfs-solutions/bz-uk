-- ════════════════════════════════════════════════════════════════
-- Admin Accounts → Payment Transactions ledger
--
-- Frozen row per paid order capturing buyer payment details at the
-- moment payment_status transitions to paid/completed/succeeded.
-- Admin reads via get_admin_payment_transactions(p_from, p_to).
-- ════════════════════════════════════════════════════════════════

-- ─── paid_at on orders (payment timestamp) ───────────────────────
alter table public.orders
  add column if not exists paid_at timestamptz;

comment on column public.orders.paid_at is
  'Timestamp when payment_status first became paid/completed/succeeded. Immutable thereafter.';

-- ─── Ledger table ───────────────────────────────────────────────
create table if not exists public.admin_payment_transactions (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null unique references public.orders(id) on delete cascade,
  order_number         text,
  seller_name          text,
  buyer_name           text,
  total_amount_paid    numeric(18,2) not null default 0,
  payment_currency     text not null default 'INR',
  paid_at              timestamptz not null,
  payment_method       text,
  buyer_to_inr_fx_rate numeric(18,8),
  markup_total_inr     numeric(18,2),
  payment_intent_id    text,
  created_at           timestamptz not null default now()
);

create index if not exists admin_payment_transactions_paid_at_idx
  on public.admin_payment_transactions (paid_at desc);

create index if not exists admin_payment_transactions_order_number_idx
  on public.admin_payment_transactions (order_number);

alter table public.admin_payment_transactions enable row level security;

drop policy if exists "admin read admin_payment_transactions" on public.admin_payment_transactions;
create policy "admin read admin_payment_transactions"
  on public.admin_payment_transactions
  for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- ─── Helper: buyer currency → INR rate from countries table ─────
create or replace function public._buyer_to_inr_fx_rate(p_buyer_currency text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select round(
    coalesce(
      (select c_inr.exchange_rate
       from public.countries c_inr
       where upper(c_inr.currency_code) = 'INR' and c_inr.is_active = true
       limit 1),
      1
    )
    /
    nullif(
      coalesce(
        (select c_buyer.exchange_rate
         from public.countries c_buyer
         where upper(c_buyer.currency_code) = upper(trim(coalesce(p_buyer_currency, 'INR')))
           and c_buyer.is_active = true
         limit 1),
        (select c_inr.exchange_rate
         from public.countries c_inr
         where upper(c_inr.currency_code) = 'INR' and c_inr.is_active = true
         limit 1),
        1
      ),
      0
    ),
    8
  );
$$;

-- ─── Stamp paid_at before payment_status flips to paid ───────────
create or replace function public.stamp_order_paid_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.payment_status, '')) in ('paid', 'completed', 'succeeded')
     and lower(coalesce(old.payment_status, '')) not in ('paid', 'completed', 'succeeded') then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_order_paid_at on public.orders;
create trigger trg_stamp_order_paid_at
  before update of payment_status on public.orders
  for each row
  execute function public.stamp_order_paid_at();

-- ─── Capture payment transaction row after payment confirmed ─────
create or replace function public.capture_admin_payment_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer_ccy text;
  v_buyer_to_inr numeric;
begin
  if not (
    lower(coalesce(new.payment_status, '')) in ('paid', 'completed', 'succeeded')
    and lower(coalesce(old.payment_status, '')) not in ('paid', 'completed', 'succeeded')
  ) then
    return new;
  end if;

  v_buyer_ccy := upper(trim(coalesce(new.currency, 'INR')));
  v_buyer_to_inr := public._buyer_to_inr_fx_rate(v_buyer_ccy);

  insert into public.admin_payment_transactions (
    order_id,
    order_number,
    seller_name,
    buyer_name,
    total_amount_paid,
    payment_currency,
    paid_at,
    payment_method,
    buyer_to_inr_fx_rate,
    markup_total_inr,
    payment_intent_id
  )
  values (
    new.id,
    new.order_number,
    coalesce((select p.full_name from public.profiles p where p.id = new.seller_id limit 1), '-'),
    coalesce(
      nullif(new.shipping_address->>'full_name', ''),
      (select p.full_name from public.profiles p where p.id = new.user_id limit 1),
      'Buyer'
    ),
    coalesce(new.total_amount, 0),
    coalesce(new.currency, 'INR'),
    coalesce(new.paid_at, now()),
    coalesce(nullif(trim(new.payment_method), ''), 'card'),
    v_buyer_to_inr,
    coalesce(new.platform_markup_total_inr, 0),
    new.payment_intent_id
  )
  on conflict (order_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_capture_admin_payment_transaction on public.orders;
create trigger trg_capture_admin_payment_transaction
  after update of payment_status on public.orders
  for each row
  execute function public.capture_admin_payment_transaction();

-- ─── Backfill existing paid orders ───────────────────────────────
update public.orders o
set paid_at = coalesce(o.paid_at, o.updated_at, o.created_at)
where lower(coalesce(o.payment_status, '')) in ('paid', 'completed', 'succeeded')
  and o.paid_at is null;

insert into public.admin_payment_transactions (
  order_id,
  order_number,
  seller_name,
  buyer_name,
  total_amount_paid,
  payment_currency,
  paid_at,
  payment_method,
  buyer_to_inr_fx_rate,
  markup_total_inr,
  payment_intent_id
)
select
  o.id,
  o.order_number,
  coalesce(sp.full_name, '-'),
  coalesce(
    nullif(o.shipping_address->>'full_name', ''),
    bp.full_name,
    'Buyer'
  ),
  coalesce(o.total_amount, 0),
  coalesce(o.currency, 'INR'),
  coalesce(o.paid_at, o.updated_at, o.created_at),
  coalesce(nullif(trim(o.payment_method), ''), 'card'),
  public._buyer_to_inr_fx_rate(o.currency),
  coalesce(o.platform_markup_total_inr, 0),
  o.payment_intent_id
from public.orders o
left join public.profiles bp on bp.id = o.user_id
left join public.profiles sp on sp.id = o.seller_id
where lower(coalesce(o.payment_status, '')) in ('paid', 'completed', 'succeeded')
  and not exists (
    select 1
    from public.admin_payment_transactions t
    where t.order_id = o.id
  );

-- ─── Admin read RPC ───────────────────────────────────────────────
create or replace function public.get_admin_payment_transactions(
  p_from timestamptz,
  p_to   timestamptz
)
returns table (
  order_id             uuid,
  order_number         text,
  seller_name          text,
  buyer_name           text,
  total_amount_paid    numeric,
  payment_currency     text,
  paid_at              timestamptz,
  payment_method       text,
  buyer_to_inr_fx_rate numeric,
  markup_total_inr     numeric,
  payment_intent_id    text
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
    t.order_id,
    t.order_number,
    t.seller_name,
    t.buyer_name,
    t.total_amount_paid,
    t.payment_currency,
    t.paid_at,
    t.payment_method,
    t.buyer_to_inr_fx_rate,
    t.markup_total_inr,
    t.payment_intent_id
  from public.admin_payment_transactions t
  where t.paid_at between p_from and p_to
  order by t.paid_at desc;
end;
$$;

grant execute on function public.get_admin_payment_transactions(timestamptz, timestamptz) to authenticated;

comment on table public.admin_payment_transactions is
  'Frozen buyer payment ledger for admin Accounts → Transactions. One row per paid order; FX to INR captured at payment confirmation.';
comment on function public.get_admin_payment_transactions(timestamptz, timestamptz) is
  'Admin-only read of payment transactions, filtered by paid_at.';
