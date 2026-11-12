-- ════════════════════════════════════════════════════════════════
-- Buyer refund-request workflow
--
-- Buyer presses "Request Refund" on a cancelled+paid order →
--   request_refund() inserts a row in refund_requests with status
--   'requested' and a human-readable refund_number (REF-...).
--
-- Admin sees the queue via get_admin_refund_requests() and approves /
-- rejects via admin_review_refund_request().
--
-- NOTE: This migration only manages REQUEST state. The actual Stripe
-- refund-money-movement is a separate concern handled later.
-- ════════════════════════════════════════════════════════════════

-- ─── refund_requests table ─────────────────────────────────────
create table if not exists public.refund_requests (
  id              uuid primary key default gen_random_uuid(),
  refund_number   text unique not null,
  order_id        uuid not null references public.orders(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  amount          numeric not null,
  currency        text not null,
  reason          text,
  status          text not null default 'requested'
    check (status in ('requested','accepted','rejected')),
  admin_note      text,
  reviewed_by     uuid references auth.users(id),
  reviewed_at     timestamptz,
  requested_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (order_id)
);

create index if not exists refund_requests_status_idx on public.refund_requests (status);
create index if not exists refund_requests_user_idx on public.refund_requests (user_id);
create index if not exists refund_requests_requested_at_idx on public.refund_requests (requested_at desc);

alter table public.refund_requests enable row level security;

-- Buyers read their own; admins read all
drop policy if exists "refund_requests buyer read own" on public.refund_requests;
create policy "refund_requests buyer read own"
  on public.refund_requests for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- Writes ONLY through security-definer RPCs below (no direct insert/update from clients).

-- updated_at trigger
create or replace function public._refund_requests_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists refund_requests_set_updated_at on public.refund_requests;
create trigger refund_requests_set_updated_at
  before update on public.refund_requests
  for each row execute function public._refund_requests_set_updated_at();

-- ─── Helper: generate refund number REF-<12 digit> ──────────────
create or replace function public._generate_refund_number()
returns text language plpgsql as $$
declare
  v text;
begin
  loop
    v := 'REF-' || lpad((floor(random() * 1e12))::bigint::text, 12, '0');
    exit when not exists (select 1 from public.refund_requests where refund_number = v);
  end loop;
  return v;
end;
$$;

-- ════════════════════════════════════════════════════════════════
-- BUYER RPC: request_refund(order_id, reason)
-- ════════════════════════════════════════════════════════════════
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
  v_order        public.orders%rowtype;
  v_uid          uuid := auth.uid();
  v_refund_no    text;
  v_id           uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'order not found';
  end if;

  -- Only the buyer of the order may request
  if v_order.user_id <> v_uid then
    raise exception 'forbidden: not your order';
  end if;

  -- Must be cancelled
  if v_order.cancelled_at is null and lower(coalesce(v_order.status,'')) <> 'cancelled' then
    raise exception 'refund can only be requested for cancelled orders';
  end if;

  -- Must have been paid
  if lower(coalesce(v_order.payment_status,'')) not in ('paid','completed','succeeded') then
    raise exception 'refund can only be requested for paid orders';
  end if;

  -- One request per order (enforced by unique constraint; pre-check for nicer error)
  if exists (select 1 from public.refund_requests where order_id = p_order_id) then
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

  return query
  select v_id, v_refund_no, 'requested'::text;
end;
$$;

grant execute on function public.request_refund(uuid, text) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- BUYER RPC: get_user_refund_request(order_id) — for UI badge
-- ════════════════════════════════════════════════════════════════
create or replace function public.get_user_refund_request(p_order_id uuid)
returns table (
  id            uuid,
  refund_number text,
  status        text,
  amount        numeric,
  currency      text,
  requested_at  timestamptz,
  reviewed_at   timestamptz,
  admin_note    text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select r.id, r.refund_number, r.status, r.amount, r.currency,
         r.requested_at, r.reviewed_at, r.admin_note
  from public.refund_requests r
  join public.orders o on o.id = r.order_id
  where r.order_id = p_order_id
    and (o.user_id = v_uid or exists (
      select 1 from public.profiles where id = v_uid and role = 'admin'
    ));
end;
$$;

grant execute on function public.get_user_refund_request(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- ADMIN RPC: get_admin_refund_requests(status filter)
-- ════════════════════════════════════════════════════════════════
create or replace function public.get_admin_refund_requests(
  p_status text default null   -- null = all
)
returns table (
  id             uuid,
  refund_number  text,
  order_id       uuid,
  order_number   text,
  buyer_name     text,
  buyer_email    text,
  amount         numeric,
  currency       text,
  reason         text,
  status         text,
  admin_note     text,
  requested_at   timestamptz,
  reviewed_at    timestamptz
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
    r.id,
    r.refund_number,
    r.order_id,
    o.order_number,
    coalesce(nullif(o.shipping_address->>'full_name',''), p.full_name, 'Buyer') as buyer_name,
    p.email as buyer_email,
    r.amount,
    r.currency,
    r.reason,
    r.status,
    r.admin_note,
    r.requested_at,
    r.reviewed_at
  from public.refund_requests r
  join public.orders o on o.id = r.order_id
  left join public.profiles p on p.id = r.user_id
  where p_status is null or r.status = p_status
  order by r.requested_at desc;
end;
$$;

grant execute on function public.get_admin_refund_requests(text) to authenticated;

-- ════════════════════════════════════════════════════════════════
-- ADMIN RPC: admin_review_refund_request(id, decision, admin_note)
-- ════════════════════════════════════════════════════════════════
create or replace function public.admin_review_refund_request(
  p_request_id uuid,
  p_decision   text,         -- 'accepted' | 'rejected'
  p_admin_note text default null
)
returns table (
  id     uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles where id = v_uid and role = 'admin'
  ) then
    raise exception 'forbidden: admin role required';
  end if;

  if p_decision not in ('accepted','rejected') then
    raise exception 'invalid decision: must be accepted or rejected';
  end if;

  update public.refund_requests
  set status      = p_decision,
      admin_note  = nullif(trim(coalesce(p_admin_note, '')), ''),
      reviewed_by = v_uid,
      reviewed_at = now()
  where refund_requests.id = p_request_id
    and refund_requests.status = 'requested';

  if not found then
    raise exception 'refund request not found or already reviewed';
  end if;

  return query
  select p_request_id, p_decision;
end;
$$;

grant execute on function public.admin_review_refund_request(uuid, text, text) to authenticated;

comment on table  public.refund_requests is 'Buyer-initiated refund requests; admin approves/rejects. Stripe money-movement handled separately.';
comment on function public.request_refund(uuid, text) is 'Buyer files a refund request for a cancelled+paid order. Returns auto-generated refund_number.';
comment on function public.admin_review_refund_request(uuid, text, text) is 'Admin marks a refund request as accepted or rejected.';
