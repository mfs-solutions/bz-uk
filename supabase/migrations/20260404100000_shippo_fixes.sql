begin;

-- ============================================================
-- Shippo Integration Fixes
-- 1. Tracking event dedup constraint
-- 2. Expand operation_logs check constraint for new actions
-- 3. Grant service_role insert on notifications (for webhook)
-- ============================================================

-- 1. Unique constraint to prevent duplicate tracking events
--    A tracking event is uniquely identified by shipment + status + timestamp
create unique index if not exists idx_shippo_tracking_events_dedup
  on public.shippo_tracking_events (shipment_id, status, event_at);

-- 2. Drop old operation check and replace with expanded list
alter table public.shippo_operation_logs
  drop constraint if exists shippo_operation_logs_operation_check;

alter table public.shippo_operation_logs
  add constraint shippo_operation_logs_operation_check
    check (
      operation in (
        'get_rates',
        'create_shipment',
        'create_label',
        'track_shipment',
        'validate_address',
        'refund_label',
        'create_return_label',
        'schedule_pickup'
      )
    );

-- 3. Allow service_role to insert notifications (webhook runs with service_role key)
--    The notifications table already exists; just ensure service_role can insert.
grant insert on table public.notifications to service_role;

-- 4. Allow service_role full access to shippo tables (webhook + ops use service_role)
grant select, insert, update on table public.shippo_shipments to service_role;
grant select, insert on table public.shippo_operation_logs to service_role;
grant select, insert on table public.shippo_tracking_events to service_role;
grant select, insert, update on table public.shippo_webhook_events to service_role;

commit;
