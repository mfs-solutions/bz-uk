begin;

create table if not exists public.delhivery_operation_logs (
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
  created_at timestamptz not null default now(),
  constraint delhivery_operation_logs_operation_check
    check (
      operation in (
        'check_pincode_serviceability',
        'calculate_shipping_cost',
        'create_shipment',
        'update_shipment',
        'cancel_shipment',
        'fetch_waybill',
        'generate_label',
        'schedule_pickup',
        'track_shipment',
        'ndr_action'
      )
    )
);

create table if not exists public.delhivery_shipments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  order_id uuid,
  awb_number text,
  waybill text,
  shipment_reference text,
  pickup_request_id text,
  status text not null default 'created',
  destination_postal_code text,
  is_cod boolean not null default false,
  charged_amount numeric(12,2),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delhivery_shipments_awb_unique unique (awb_number),
  constraint delhivery_shipments_waybill_unique unique (waybill)
);

create table if not exists public.delhivery_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  shipment_id uuid references public.delhivery_shipments(id) on delete set null,
  pickup_request_id text not null,
  status text not null default 'requested',
  scheduled_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delhivery_pickup_requests_request_id_unique unique (pickup_request_id)
);

create table if not exists public.delhivery_tracking_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.delhivery_shipments(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  status_code text,
  status text,
  location text,
  event_at timestamptz,
  remarks text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.delhivery_webhook_events (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.delhivery_shipments(id) on delete set null,
  seller_id uuid references public.profiles(id) on delete set null,
  event_type text,
  awb_number text,
  signature text,
  payload jsonb not null default '{}'::jsonb,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.delhivery_ndr_actions (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.delhivery_shipments(id) on delete set null,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb,
  success boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_delhivery_operation_logs_seller_created
  on public.delhivery_operation_logs (seller_id, created_at desc);

create index if not exists idx_delhivery_shipments_seller_created
  on public.delhivery_shipments (seller_id, created_at desc);

create index if not exists idx_delhivery_shipments_order_id
  on public.delhivery_shipments (order_id);

create index if not exists idx_delhivery_tracking_events_shipment_created
  on public.delhivery_tracking_events (shipment_id, created_at desc);

create index if not exists idx_delhivery_webhook_events_awb_created
  on public.delhivery_webhook_events (awb_number, created_at desc);

alter table public.delhivery_operation_logs enable row level security;
alter table public.delhivery_shipments enable row level security;
alter table public.delhivery_pickup_requests enable row level security;
alter table public.delhivery_tracking_events enable row level security;
alter table public.delhivery_webhook_events enable row level security;
alter table public.delhivery_ndr_actions enable row level security;

grant select, insert on table public.delhivery_operation_logs to authenticated;
grant select, insert, update on table public.delhivery_shipments to authenticated;
grant select, insert, update on table public.delhivery_pickup_requests to authenticated;
grant select, insert on table public.delhivery_tracking_events to authenticated;
grant select on table public.delhivery_webhook_events to authenticated;
grant select, insert on table public.delhivery_ndr_actions to authenticated;

drop policy if exists delhivery_operation_logs_select_own on public.delhivery_operation_logs;
create policy delhivery_operation_logs_select_own
  on public.delhivery_operation_logs for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists delhivery_operation_logs_insert_own on public.delhivery_operation_logs;
create policy delhivery_operation_logs_insert_own
  on public.delhivery_operation_logs for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists delhivery_shipments_select_own on public.delhivery_shipments;
create policy delhivery_shipments_select_own
  on public.delhivery_shipments for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists delhivery_shipments_insert_own on public.delhivery_shipments;
create policy delhivery_shipments_insert_own
  on public.delhivery_shipments for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists delhivery_shipments_update_own on public.delhivery_shipments;
create policy delhivery_shipments_update_own
  on public.delhivery_shipments for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

drop policy if exists delhivery_pickup_requests_select_own on public.delhivery_pickup_requests;
create policy delhivery_pickup_requests_select_own
  on public.delhivery_pickup_requests for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists delhivery_pickup_requests_insert_own on public.delhivery_pickup_requests;
create policy delhivery_pickup_requests_insert_own
  on public.delhivery_pickup_requests for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists delhivery_pickup_requests_update_own on public.delhivery_pickup_requests;
create policy delhivery_pickup_requests_update_own
  on public.delhivery_pickup_requests for update to authenticated
  using (seller_id = auth.uid())
  with check (seller_id = auth.uid());

drop policy if exists delhivery_tracking_events_select_own on public.delhivery_tracking_events;
create policy delhivery_tracking_events_select_own
  on public.delhivery_tracking_events for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists delhivery_tracking_events_insert_own on public.delhivery_tracking_events;
create policy delhivery_tracking_events_insert_own
  on public.delhivery_tracking_events for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists delhivery_webhook_events_select_own on public.delhivery_webhook_events;
create policy delhivery_webhook_events_select_own
  on public.delhivery_webhook_events for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists delhivery_ndr_actions_select_own on public.delhivery_ndr_actions;
create policy delhivery_ndr_actions_select_own
  on public.delhivery_ndr_actions for select to authenticated
  using (seller_id = auth.uid());

drop policy if exists delhivery_ndr_actions_insert_own on public.delhivery_ndr_actions;
create policy delhivery_ndr_actions_insert_own
  on public.delhivery_ndr_actions for insert to authenticated
  with check (seller_id = auth.uid());

drop policy if exists delhivery_operation_logs_admin_all on public.delhivery_operation_logs;
create policy delhivery_operation_logs_admin_all
  on public.delhivery_operation_logs for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists delhivery_shipments_admin_all on public.delhivery_shipments;
create policy delhivery_shipments_admin_all
  on public.delhivery_shipments for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists delhivery_pickup_requests_admin_all on public.delhivery_pickup_requests;
create policy delhivery_pickup_requests_admin_all
  on public.delhivery_pickup_requests for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists delhivery_tracking_events_admin_all on public.delhivery_tracking_events;
create policy delhivery_tracking_events_admin_all
  on public.delhivery_tracking_events for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists delhivery_webhook_events_admin_all on public.delhivery_webhook_events;
create policy delhivery_webhook_events_admin_all
  on public.delhivery_webhook_events for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists delhivery_ndr_actions_admin_all on public.delhivery_ndr_actions;
create policy delhivery_ndr_actions_admin_all
  on public.delhivery_ndr_actions for all to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop trigger if exists delhivery_shipments_updated_at on public.delhivery_shipments;
create trigger delhivery_shipments_updated_at
  before update on public.delhivery_shipments
  for each row execute function public.update_updated_at_column();

drop trigger if exists delhivery_pickup_requests_updated_at on public.delhivery_pickup_requests;
create trigger delhivery_pickup_requests_updated_at
  before update on public.delhivery_pickup_requests
  for each row execute function public.update_updated_at_column();

commit;
