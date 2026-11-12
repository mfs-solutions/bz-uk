-- Fix Order Details snapshots: correct INR-scaled amounts stored under foreign
-- currency labels, repair drift when orders.total_amount is corrected, and
-- keep snapshots aligned with locked orders.platform_markup_total_inr.

begin;

-- Undo INR-equivalent buyer totals mis-labelled as GBP/EUR (e.g. 3919.56 "GBP"
-- when product_subtotal is 29.58 and real buyer total is ~30.47).
create or replace function public.normalize_order_details_buyer_amount(
  p_amount numeric,
  p_currency text,
  p_fx_rate numeric,
  p_product_subtotal numeric default null
)
returns numeric
language plpgsql
immutable
as $$
declare
  v_amount numeric := round(coalesce(p_amount, 0), 2);
  v_ccy text := upper(trim(coalesce(p_currency, 'INR')));
  v_fx numeric := coalesce(nullif(p_fx_rate, 0), 1);
  v_subtotal numeric := round(coalesce(p_product_subtotal, v_amount), 2);
  v_candidate numeric;
begin
  if v_ccy = 'INR' or v_fx <= 1 or p_product_subtotal is null then
    return v_amount;
  end if;

  v_candidate := round(v_amount / v_fx, 2);

  -- Only treat as INR-scaled bug when:
  --   • stored amount is far above the product subtotal in buyer currency
  --   • dividing by FX lands near the subtotal band (real buyer-side total)
  --   • stored amount ≈ candidate × FX
  if v_amount > v_subtotal * 2
     and abs(v_candidate - v_subtotal) <= greatest(v_subtotal * 0.15, 1.0)
     and abs(v_candidate * v_fx - v_amount) <= greatest(v_amount * 0.02, 0.05)
  then
    return v_candidate;
  end if;

  return v_amount;
end;
$$;

comment on function public.normalize_order_details_buyer_amount(numeric, text, numeric, numeric) is
  'Buyer-facing order total for Order Details snapshots; detects INR-equivalent totals mis-labelled as foreign currency using product_subtotal as anchor.';

create or replace function public.ingest_order_details_snapshots()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Insert NEW snapshots once FX + markup are locked on the order.
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
    public.normalize_order_details_buyer_amount(
      o.total_amount,
      o.currency,
      o.buyer_to_seller_fx_rate,
      o.product_subtotal
    ),
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
    and o.fx_locked_at is not null
    and o.platform_markup_total_inr is not null
    and (
      lower(coalesce(o.payment_status, '')) in ('paid','completed','succeeded')
      or o.cancelled_at is not null
    )
    and not exists (
      select 1 from public.order_details_snapshots s where s.order_id = o.id
    );

  -- 2) Sync status + financial fields from authoritative orders row.
  update public.order_details_snapshots s
  set
    status = src.new_status,
    order_amount = src.order_amount,
    order_currency = src.order_currency,
    exchange_rate = src.exchange_rate,
    markup_price = src.markup_price,
    updated_at = now()
  from (
    select
      o.id as order_id,
      case
        when o.cancelled_at is not null then 'CANCELLED'
        else 'PAID'
      end as new_status,
      round(coalesce(o.total_amount, 0), 2) as order_amount,
      coalesce(o.currency, 'INR') as order_currency,
      o.buyer_to_seller_fx_rate as exchange_rate,
      o.platform_markup_total_inr as markup_price
    from public.orders o
  ) src
  where s.order_id = src.order_id
    and (
      s.status is distinct from src.new_status
      or s.order_amount is distinct from src.order_amount
      or s.order_currency is distinct from src.order_currency
      or s.exchange_rate is distinct from src.exchange_rate
      or s.markup_price is distinct from src.markup_price
    );
end;
$$;

comment on function public.ingest_order_details_snapshots() is
  'Cron-driven Order Details snapshots: waits for FX/markup lock, normalizes buyer totals on insert, syncs financial fields from orders when corrected.';

-- Repair all existing rows from live orders (authoritative source).
update public.order_details_snapshots s
set
  order_amount = round(coalesce(o.total_amount, 0), 2),
  order_currency = coalesce(o.currency, 'INR'),
  exchange_rate = o.buyer_to_seller_fx_rate,
  markup_price = o.platform_markup_total_inr,
  updated_at = now()
from public.orders o
where s.order_id = o.id
  and (
    s.order_amount is distinct from round(coalesce(o.total_amount, 0), 2)
    or s.order_currency is distinct from coalesce(o.currency, 'INR')
    or s.exchange_rate is distinct from o.buyer_to_seller_fx_rate
    or s.markup_price is distinct from o.platform_markup_total_inr
  );

select public.ingest_order_details_snapshots();

commit;
