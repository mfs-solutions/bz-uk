-- Fix: column reference "id" is ambiguous in request_refund().
-- RETURNS TABLE exposes an OUT column named `id`, which collides with
-- `orders.id` inside `where id = p_order_id`. Qualify the column reference.

create or replace function public.request_refund(
  p_order_id uuid,
  p_reason   text
)
returns table (
  id            uuid,
  refund_number text,
  status        text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order     public.orders%rowtype;
  v_uid       uuid := auth.uid();
  v_refund_no text;
  v_id        uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;

  if v_order.user_id <> v_uid then
    raise exception 'forbidden: not your order';
  end if;

  if v_order.cancelled_at is null and lower(coalesce(v_order.status,'')) <> 'cancelled' then
    raise exception 'refund can only be requested for cancelled orders';
  end if;

  if lower(coalesce(v_order.payment_status,'')) not in ('paid','completed','succeeded') then
    raise exception 'refund can only be requested for paid orders';
  end if;

  if exists (
    select 1 from public.refund_requests rr where rr.order_id = p_order_id
  ) then
    raise exception 'refund already requested for this order';
  end if;

  v_refund_no := public._generate_refund_number();

  insert into public.refund_requests (
    refund_number, order_id, user_id, amount, currency, reason, status
  )
  values (
    v_refund_no,
    p_order_id,
    v_uid,
    coalesce(v_order.total_amount, 0),
    coalesce(v_order.currency, 'INR'),
    nullif(trim(coalesce(p_reason, '')), ''),
    'requested'
  )
  returning refund_requests.id into v_id;

  return query select v_id, v_refund_no, 'requested'::text;
end;
$$;

grant execute on function public.request_refund(uuid, text) to authenticated;
