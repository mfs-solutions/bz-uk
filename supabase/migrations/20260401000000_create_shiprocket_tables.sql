begin;

-- ============================================================
-- Shiprocket International Shipping System
-- Shiprocket is ONLY for international shipments.
-- Delhivery remains the sole domestic carrier.
-- ============================================================

-- Platform-level Shiprocket token cache (single account, managed server-side)
create table if not exists public.shiprocket_auth_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one active token row at a time
create unique index if not exists idx_shiprocket_auth_tokens_email
  on public.shiprocket_auth_tokens (email);

-- Shiprocket shipments (international only)
create table if not exists public.shiprocket_shipments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid,
  sr_order_id bigint,
  sr_shipment_id bigint,
  sr_channel_order_id text,
  awb_number text,
  courier_name text,
  courier_id integer,
  status text not null default 'created',
  destination_country text,
  destination_country_code varchar(3),
  is_cod boolean not null default false,
  invoice_value numeric(12,2),
  invoice_currency text not null default 'INR',
  label_url text,
  manifest_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shiprocket_shipments_awb_unique unique (awb_number)
);

create index if not exists idx_shiprocket_shipments_seller_created
  on public.shiprocket_shipments (seller_id, created_at desc);

create index if not exists idx_shiprocket_shipments_order_id
  on public.shiprocket_shipments (order_id);

create index if not exists idx_shiprocket_shipments_sr_order_id
  on public.shiprocket_shipments (sr_order_id);

-- Shiprocket operation logs (every API call)
create table if not exists public.shiprocket_operation_logs (
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
  constraint shiprocket_operation_logs_operation_check
    check (
      operation in (
        'authenticate',
        'check_international_serviceability',
        'create_international_order',
        'assign_awb',
        'generate_label',
        'generate_manifest',
        'schedule_pickup',
        'track_shipment',
        'track_by_awb',
        'cancel_order',
        'cancel_shipment',
        'create_return'
      )
    )
);

create index if not exists idx_shiprocket_operation_logs_seller_created
  on public.shiprocket_operation_logs (seller_id, created_at desc);

-- Shiprocket tracking events
create table if not exists public.shiprocket_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shiprocket_shipments(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  sr_status text,
  sr_status_id integer,
  sr_status_label text,
  activity text,
  location text,
  event_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_shiprocket_tracking_events_shipment_created
  on public.shiprocket_tracking_events (shipment_id, created_at desc);

-- Shiprocket webhook events
create table if not exists public.shiprocket_webhook_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shiprocket_shipments(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  event_type text,
  awb_number text,
  sr_order_id bigint,
  current_status text,
  current_status_id integer,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_shiprocket_webhook_events_awb_created
  on public.shiprocket_webhook_events (awb_number, created_at desc);

-- Add hs_code to products table for customs declarations
alter table public.products
  add column if not exists hs_code text;

-- ============================================================
-- RLS Policies
-- ============================================================

-- shiprocket_auth_tokens: only service_role/edge functions access this
alter table public.shiprocket_auth_tokens enable row level security;
-- No direct user access — edge functions use service_role key

-- shiprocket_shipments
alter table public.shiprocket_shipments enable row level security;

grant select, insert, update on table public.shiprocket_shipments to authenticated;

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

-- shiprocket_operation_logs
alter table public.shiprocket_operation_logs enable row level security;

grant select, insert on table public.shiprocket_operation_logs to authenticated;

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

-- shiprocket_tracking_events
alter table public.shiprocket_tracking_events enable row level security;

grant select, insert on table public.shiprocket_tracking_events to authenticated;

drop policy if exists shiprocket_tracking_events_select_own on public.shiprocket_tracking_events;
create policy shiprocket_tracking_events_select_own
  on public.shiprocket_tracking_events for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists shiprocket_tracking_events_insert_own on public.shiprocket_tracking_events;
create policy shiprocket_tracking_events_insert_own
  on public.shiprocket_tracking_events for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists shiprocket_tracking_events_admin_all on public.shiprocket_tracking_events;
create policy shiprocket_tracking_events_admin_all
  on public.shiprocket_tracking_events for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- shiprocket_webhook_events
alter table public.shiprocket_webhook_events enable row level security;

grant select on table public.shiprocket_webhook_events to authenticated;

drop policy if exists shiprocket_webhook_events_select_own on public.shiprocket_webhook_events;
create policy shiprocket_webhook_events_select_own
  on public.shiprocket_webhook_events for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists shiprocket_webhook_events_admin_all on public.shiprocket_webhook_events;
create policy shiprocket_webhook_events_admin_all
  on public.shiprocket_webhook_events for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- ============================================================
-- Auto-update timestamps
-- ============================================================

drop trigger if exists shiprocket_auth_tokens_updated_at on public.shiprocket_auth_tokens;
create trigger shiprocket_auth_tokens_updated_at
  before update on public.shiprocket_auth_tokens
  for each row execute function public.update_updated_at_column();

drop trigger if exists shiprocket_shipments_updated_at on public.shiprocket_shipments;
create trigger shiprocket_shipments_updated_at
  before update on public.shiprocket_shipments
  for each row execute function public.update_updated_at_column();

commit;
