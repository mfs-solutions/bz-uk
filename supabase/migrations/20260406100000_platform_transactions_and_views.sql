-- ============================================================
-- Platform Transactions ledger + financial views
-- ============================================================

-- 1. platform_transactions: every financial event in one place
create table if not exists public.platform_transactions (
  id uuid primary key default gen_random_uuid(),
  txn_date timestamptz not null default now(),
  txn_type text not null check (txn_type in (
    'sale','refund','payout','shipping','commission','expense','adjustment'
  )),
  description text not null default '',
  order_id uuid references public.orders(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  gross_amount numeric(12,2) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  net_amount numeric(12,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'completed' check (status in ('pending','completed','failed')),
  reference text,
  metadata jsonb default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_txn_date on public.platform_transactions (txn_date desc);
create index if not exists idx_platform_txn_type on public.platform_transactions (txn_type, txn_date desc);
create index if not exists idx_platform_txn_seller on public.platform_transactions (seller_id, txn_date desc);
create index if not exists idx_platform_txn_order on public.platform_transactions (order_id);

-- RLS
alter table public.platform_transactions enable row level security;

create policy "admin_platform_txn_select" on public.platform_transactions
  for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_platform_txn_insert" on public.platform_transactions
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_platform_txn_update" on public.platform_transactions
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "admin_platform_txn_delete" on public.platform_transactions
  for delete using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- 2. Add receipt_url to expense_entries for file attachments
alter table public.expense_entries
  add column if not exists receipt_url text;

-- 3. Add seller_name, store_name, bank_details to seller_payouts for display
alter table public.seller_payouts
  add column if not exists gross_sales numeric(12,2) default 0,
  add column if not exists commission_deducted numeric(12,2) default 0,
  add column if not exists shipping_deducted numeric(12,2) default 0,
  add column if not exists refund_adjusted numeric(12,2) default 0,
  add column if not exists tds_deducted numeric(12,2) default 0,
  add column if not exists net_payout numeric(12,2) default 0,
  add column if not exists processed_at timestamptz;

-- 4. Create view for daily profit breakup (admin only, used by RPC)
create or replace function public.get_daily_profit_breakup(p_date date default current_date)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'date', p_date,
    'gmv', coalesce((
      select sum(total_amount) from orders
      where created_at::date = p_date
        and status not in ('cancelled','refunded','returned')
        and payment_status in ('paid','completed','succeeded')
    ), 0),
    'seller_cost', coalesce((
      select sum(seller_earning) from orders
      where created_at::date = p_date
        and status not in ('cancelled','refunded','returned')
        and payment_status in ('paid','completed','succeeded')
    ), 0),
    'shipping_cost', coalesce((
      select sum(actual_shipping_cost) from orders
      where created_at::date = p_date
        and status not in ('cancelled','refunded','returned')
        and payment_status in ('paid','completed','succeeded')
    ), 0),
    'platform_fee', coalesce((
      select sum(platform_fee) from orders
      where created_at::date = p_date
        and status not in ('cancelled','refunded','returned')
        and payment_status in ('paid','completed','succeeded')
    ), 0),
    'refunds', coalesce((
      select sum(total_amount) from orders
      where created_at::date = p_date
        and status in ('refunded','returned')
    ), 0),
    'expenses', coalesce((
      select sum(amount) from expense_entries
      where expense_date = p_date
    ), 0),
    'order_count', coalesce((
      select count(*) from orders
      where created_at::date = p_date
        and status not in ('cancelled','refunded','returned')
        and payment_status in ('paid','completed','succeeded')
    ), 0),
    'commission_earned', coalesce((
      select sum(platform_fee) from orders
      where created_at::date = p_date
        and status not in ('cancelled','refunded','returned')
        and payment_status in ('paid','completed','succeeded')
    ), 0)
  ) into result;

  return result;
end;
$$;

-- 5. Get seller payout summary for the period
create or replace function public.get_seller_payout_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  select json_build_object(
    'pending_amount', coalesce((
      select sum(amount) from seller_payouts where status = 'pending'
    ), 0),
    'pending_count', coalesce((
      select count(*) from seller_payouts where status = 'pending'
    ), 0),
    'completed_today', coalesce((
      select sum(amount) from seller_payouts
      where status = 'completed' and processed_at::date = current_date
    ), 0),
    'completed_today_count', coalesce((
      select count(*) from seller_payouts
      where status = 'completed' and processed_at::date = current_date
    ), 0),
    'on_hold_amount', coalesce((
      select sum(amount) from seller_payouts where status = 'failed'
    ), 0),
    'on_hold_count', coalesce((
      select count(*) from seller_payouts where status = 'failed'
    ), 0),
    'week_total', coalesce((
      select sum(amount) from seller_payouts
      where created_at >= date_trunc('week', current_date)
    ), 0),
    'week_count', coalesce((
      select count(distinct seller_id) from seller_payouts
      where created_at >= date_trunc('week', current_date)
    ), 0)
  ) into result;

  return result;
end;
$$;

-- 6. Grant execute to authenticated
grant execute on function public.get_daily_profit_breakup(date) to authenticated;
grant execute on function public.get_seller_payout_summary() to authenticated;
