begin;

-- ============================================================
-- SHIPROCKET INTEGRATION TABLES
-- Mirrors the Delhivery table structure for consistency.
-- ============================================================

-- 1. Per-seller Shiprocket account config (pickup location)
create table if not exists public.seller_shiprocket_accounts (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  pickup_postal_code text not null default '',
  pickup_address_line_1 text not null default '',
  pickup_city text not null default '',
  pickup_state text not null default '',
  pickup_country text not null default 'India',
  pickup_location_name text not null default '',
  shiprocket_pickup_location_id text not null default '',
  channel_id text not null default '',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Per-product Shiprocket shipping config
create table if not exists public.product_shiprocket_shipping (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  pickup_postal_code text not null default '',
  use_live_rate boolean not null default true,
  fallback_shipping_charge numeric(12,2) not null default 0,
  fallback_delivery_days integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_shiprocket_shipping_product_id_unique unique (product_id)
);

-- 3. Shiprocket operation logs (request/response audit)
create table if not exists public.shiprocket_operation_logs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_id uuid,
  operation text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  http_status integer,
  success boolean not null default false,
  provider_reference text,
  error_message text,
  created_at timestamptz not null default now()
);

-- 4. Shiprocket shipments (AWB, order tracking)
create table if not exists public.shiprocket_shipments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_id uuid,
  shiprocket_order_id text,
  shiprocket_shipment_id text,
  awb_code text,
  courier_company_id text,
  courier_name text,
  status text not null default 'created',
  destination_postal_code text,
  is_cod boolean not null default false,
  charged_amount numeric(12,2),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shiprocket_shipments_awb_unique unique (awb_code)
);

-- 5. Shiprocket pickup requests
create table if not exists public.shiprocket_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  shipment_id uuid references public.shiprocket_shipments(id) on delete set null,
  pickup_request_id text not null,
  status text not null default 'requested',
  scheduled_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shiprocket_pickup_requests_request_id_unique unique (pickup_request_id)
);

-- 6. Shiprocket tracking events
create table if not exists public.shiprocket_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shiprocket_shipments(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  status_code text,
  status text,
  location text,
  event_at timestamptz,
  remarks text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 7. Shiprocket webhook events
create table if not exists public.shiprocket_webhook_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shiprocket_shipments(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  event_type text,
  awb_code text,
  signature text,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_product_shiprocket_shipping_seller_id
  on public.product_shiprocket_shipping (seller_id);

create index if not exists idx_shiprocket_operation_logs_seller_created
  on public.shiprocket_operation_logs (seller_id, created_at desc);

create index if not exists idx_shiprocket_shipments_seller_created
  on public.shiprocket_shipments (seller_id, created_at desc);

create index if not exists idx_shiprocket_shipments_order_id
  on public.shiprocket_shipments (order_id);

create index if not exists idx_shiprocket_shipments_awb_code
  on public.shiprocket_shipments (awb_code);

create index if not exists idx_shiprocket_tracking_events_shipment_created
  on public.shiprocket_tracking_events (shipment_id, created_at desc);

create index if not exists idx_shiprocket_webhook_events_awb_created
  on public.shiprocket_webhook_events (awb_code, created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.seller_shiprocket_accounts enable row level security;
alter table public.product_shiprocket_shipping enable row level security;
alter table public.shiprocket_operation_logs enable row level security;
alter table public.shiprocket_shipments enable row level security;
alter table public.shiprocket_pickup_requests enable row level security;
alter table public.shiprocket_tracking_events enable row level security;
alter table public.shiprocket_webhook_events enable row level security;

-- Grants
grant select, insert, update, delete on table public.seller_shiprocket_accounts to authenticated;
grant select, insert, update, delete on table public.product_shiprocket_shipping to authenticated;
grant select, insert on table public.shiprocket_operation_logs to authenticated;
grant select, insert, update on table public.shiprocket_shipments to authenticated;
grant select, insert, update on table public.shiprocket_pickup_requests to authenticated;
grant select, insert on table public.shiprocket_tracking_events to authenticated;
grant select on table public.shiprocket_webhook_events to authenticated;

-- ── seller_shiprocket_accounts policies ──

drop policy if exists seller_shiprocket_accounts_select_own on public.seller_shiprocket_accounts;
create policy seller_shiprocket_accounts_select_own
  on public.seller_shiprocket_accounts for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists seller_shiprocket_accounts_insert_own on public.seller_shiprocket_accounts;
create policy seller_shiprocket_accounts_insert_own
  on public.seller_shiprocket_accounts for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists seller_shiprocket_accounts_update_own on public.seller_shiprocket_accounts;
create policy seller_shiprocket_accounts_update_own
  on public.seller_shiprocket_accounts for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

drop policy if exists seller_shiprocket_accounts_admin_all on public.seller_shiprocket_accounts;
create policy seller_shiprocket_accounts_admin_all
  on public.seller_shiprocket_accounts for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── product_shiprocket_shipping policies ──

drop policy if exists product_shiprocket_shipping_select_own on public.product_shiprocket_shipping;
create policy product_shiprocket_shipping_select_own
  on public.product_shiprocket_shipping for select to authenticated
  using (true);

drop policy if exists product_shiprocket_shipping_insert_own on public.product_shiprocket_shipping;
create policy product_shiprocket_shipping_insert_own
  on public.product_shiprocket_shipping for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists product_shiprocket_shipping_update_own on public.product_shiprocket_shipping;
create policy product_shiprocket_shipping_update_own
  on public.product_shiprocket_shipping for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

drop policy if exists product_shiprocket_shipping_admin_all on public.product_shiprocket_shipping;
create policy product_shiprocket_shipping_admin_all
  on public.product_shiprocket_shipping for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── shiprocket_operation_logs policies ──

drop policy if exists shiprocket_operation_logs_select_own on public.shiprocket_operation_logs;
create policy shiprocket_operation_logs_select_own
  on public.shiprocket_operation_logs for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists shiprocket_operation_logs_insert_own on public.shiprocket_operation_logs;
create policy shiprocket_operation_logs_insert_own
  on public.shiprocket_operation_logs for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists shiprocket_operation_logs_admin_all on public.shiprocket_operation_logs;
create policy shiprocket_operation_logs_admin_all
  on public.shiprocket_operation_logs for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── shiprocket_shipments policies ──

drop policy if exists shiprocket_shipments_select_own on public.shiprocket_shipments;
create policy shiprocket_shipments_select_own
  on public.shiprocket_shipments for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists shiprocket_shipments_insert_own on public.shiprocket_shipments;
create policy shiprocket_shipments_insert_own
  on public.shiprocket_shipments for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists shiprocket_shipments_update_own on public.shiprocket_shipments;
create policy shiprocket_shipments_update_own
  on public.shiprocket_shipments for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

drop policy if exists shiprocket_shipments_admin_all on public.shiprocket_shipments;
create policy shiprocket_shipments_admin_all
  on public.shiprocket_shipments for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ── shiprocket_pickup_requests policies ──

drop policy if exists shiprocket_pickup_requests_select_own on public.shiprocket_pickup_requests;
create policy shiprocket_pickup_requests_select_own
  on public.shiprocket_pickup_requests for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists shiprocket_pickup_requests_insert_own on public.shiprocket_pickup_requests;
create policy shiprocket_pickup_requests_insert_own
  on public.shiprocket_pickup_requests for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists shiprocket_pickup_requests_update_own on public.shiprocket_pickup_requests;
create policy shiprocket_pickup_requests_update_own
  on public.shiprocket_pickup_requests for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

-- ── shiprocket_tracking_events policies ──

drop policy if exists shiprocket_tracking_events_select_own on public.shiprocket_tracking_events;
create policy shiprocket_tracking_events_select_own
  on public.shiprocket_tracking_events for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists shiprocket_tracking_events_insert_own on public.shiprocket_tracking_events;
create policy shiprocket_tracking_events_insert_own
  on public.shiprocket_tracking_events for insert to authenticated
  with check (seller_id = auth.uid());

-- ── shiprocket_webhook_events policies ──

drop policy if exists shiprocket_webhook_events_select_own on public.shiprocket_webhook_events;
create policy shiprocket_webhook_events_select_own
  on public.shiprocket_webhook_events for select to authenticated
  using (seller_id = auth.uid());

-- ── Updated-at triggers ──

drop trigger if exists seller_shiprocket_accounts_updated_at on public.seller_shiprocket_accounts;
create trigger seller_shiprocket_accounts_updated_at
  before update on public.seller_shiprocket_accounts
  for each row execute function public.update_updated_at_column();

drop trigger if exists product_shiprocket_shipping_updated_at on public.product_shiprocket_shipping;
create trigger product_shiprocket_shipping_updated_at
  before update on public.product_shiprocket_shipping
  for each row execute function public.update_updated_at_column();

drop trigger if exists shiprocket_shipments_updated_at on public.shiprocket_shipments;
create trigger shiprocket_shipments_updated_at
  before update on public.shiprocket_shipments
  for each row execute function public.update_updated_at_column();

drop trigger if exists shiprocket_pickup_requests_updated_at on public.shiprocket_pickup_requests;
create trigger shiprocket_pickup_requests_updated_at
  before update on public.shiprocket_pickup_requests
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- Add preferred_carrier column to products for carrier selection
-- ============================================================

alter table public.products
  add column if not exists preferred_carrier text not null default 'delhivery'
  constraint products_preferred_carrier_check check (preferred_carrier in ('delhivery', 'shiprocket'));

commit;
