begin;

-- ============================================================
-- Shippo UK Shipping System
-- Shippo handles ALL UK-origin shipments (domestic UK + UK international).
-- Delhivery = India domestic, Shiprocket = India international.
-- ============================================================

-- Shippo shipments
create table if not exists public.shippo_shipments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid,
  shippo_shipment_id text,
  shippo_transaction_id text,
  tracking_number text,
  label_url text,
  courier_name text,
  service_level text,
  rate_amount numeric(12,2),
  rate_currency text not null default 'GBP',
  estimated_delivery_days integer,
  destination_country text,
  status text not null default 'created',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shippo_shipments_tracking_unique unique (tracking_number),
  constraint shippo_shipments_transaction_unique unique (shippo_transaction_id)
);

create index if not exists idx_shippo_shipments_seller_created
  on public.shippo_shipments (seller_id, created_at desc);

create index if not exists idx_shippo_shipments_order_id
  on public.shippo_shipments (order_id);

create index if not exists idx_shippo_shipments_tracking
  on public.shippo_shipments (tracking_number);

-- Shippo operation logs (every API call)
create table if not exists public.shippo_operation_logs (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid,
  operation text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  http_status integer,
  success boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  constraint shippo_operation_logs_operation_check
    check (
      operation in (
        'get_rates',
        'create_shipment',
        'create_label',
        'track_shipment',
        'validate_address'
      )
    )
);

create index if not exists idx_shippo_operation_logs_seller_created
  on public.shippo_operation_logs (seller_id, created_at desc);

-- Shippo tracking events
create table if not exists public.shippo_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shippo_shipments(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  status text,
  status_details text,
  location text,
  event_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shippo_tracking_events_shipment_created
  on public.shippo_tracking_events (shipment_id, created_at desc);

-- Shippo webhook events (with dedup via event_hash)
create table if not exists public.shippo_webhook_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shippo_shipments(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  event_type text,
  tracking_number text,
  current_status text,
  payload jsonb not null default '{}'::jsonb,
  event_hash text,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_shippo_webhook_events_hash
  on public.shippo_webhook_events (event_hash);

create index if not exists idx_shippo_webhook_events_tracking
  on public.shippo_webhook_events (tracking_number, created_at desc);

-- ============================================================
-- RLS Policies
-- ============================================================

-- shippo_shipments
alter table public.shippo_shipments enable row level security;

grant select, insert, update on table public.shippo_shipments to authenticated;

create policy shippo_shipments_select_own
  on public.shippo_shipments for select to authenticated
  using (seller_id = auth.uid());

create policy shippo_shipments_insert_own
  on public.shippo_shipments for insert to authenticated
  with check (seller_id = auth.uid());

create policy shippo_shipments_update_own
  on public.shippo_shipments for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

create policy shippo_shipments_admin_all
  on public.shippo_shipments for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- shippo_operation_logs
alter table public.shippo_operation_logs enable row level security;

grant select, insert on table public.shippo_operation_logs to authenticated;

create policy shippo_operation_logs_select_own
  on public.shippo_operation_logs for select to authenticated
  using (seller_id = auth.uid());

create policy shippo_operation_logs_insert_own
  on public.shippo_operation_logs for insert to authenticated
  with check (seller_id = auth.uid());

create policy shippo_operation_logs_admin_all
  on public.shippo_operation_logs for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- shippo_tracking_events
alter table public.shippo_tracking_events enable row level security;

grant select, insert on table public.shippo_tracking_events to authenticated;

create policy shippo_tracking_events_select_own
  on public.shippo_tracking_events for select to authenticated
  using (seller_id = auth.uid());

create policy shippo_tracking_events_insert_own
  on public.shippo_tracking_events for insert to authenticated
  with check (seller_id = auth.uid());

create policy shippo_tracking_events_admin_all
  on public.shippo_tracking_events for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- shippo_webhook_events
alter table public.shippo_webhook_events enable row level security;

grant select on table public.shippo_webhook_events to authenticated;

create policy shippo_webhook_events_select_own
  on public.shippo_webhook_events for select to authenticated
  using (seller_id = auth.uid());

create policy shippo_webhook_events_admin_all
  on public.shippo_webhook_events for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

commit;
