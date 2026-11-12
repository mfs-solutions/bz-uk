-- Track which payment rail was used when processing a payout.
alter table public.seller_payout_runs
  add column if not exists payment_method text
  check (payment_method in ('stripe','online'));

drop function if exists public.admin_mark_seller_payout_paid(
  text, uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, int, text
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
  p_note            text default null
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

  if p_payment_method is null or p_payment_method not in ('stripe','online') then
    raise exception 'invalid payment_method: must be stripe or online';
  end if;

  insert into public.seller_payout_runs as r (
    cycle_code, seller_id, currency, period_start, period_end,
    total_amount, platform_charge, net_payout, order_count,
    status, paid_at, paid_by, note, payment_method
  ) values (
    p_cycle_code, p_seller_id, p_currency, p_period_start, p_period_end,
    p_total_amount, p_platform_charge, p_net_payout, p_order_count,
    'paid', now(), auth.uid(), p_note, p_payment_method
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
        note            = coalesce(excluded.note, r.note),
        payment_method  = excluded.payment_method
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.admin_mark_seller_payout_paid(
  text, uuid, text, timestamptz, timestamptz, numeric, numeric, numeric, int, text, text
) to authenticated;
