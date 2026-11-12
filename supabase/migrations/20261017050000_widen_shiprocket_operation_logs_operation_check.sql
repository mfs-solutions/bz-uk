-- Widen shiprocket_operation_logs.operation CHECK constraint (additive only).
--
-- The original constraint predated the newer Shiprocket ops, so inserts for
-- 'check_domestic_serviceability' (and other newer operations) were rejected and
-- domestic serviceability logging was silently swallowed.
--
-- Historical values are all kept; only newer operation names are added.
-- Idempotent: DROP IF EXISTS + re-add with the full list (safe if already applied).

ALTER TABLE public.shiprocket_operation_logs
  DROP CONSTRAINT IF EXISTS shiprocket_operation_logs_operation_check;

ALTER TABLE public.shiprocket_operation_logs
  ADD CONSTRAINT shiprocket_operation_logs_operation_check
  CHECK ((operation = ANY (ARRAY['authenticate'::text,
    'check_international_serviceability'::text,
    'check_domestic_serviceability'::text,
    'create_international_order'::text,
    'create_domestic_order'::text,
    'create_order'::text,
    'add_pickup_location'::text,
    'get_pickup_locations'::text,
    'request_pickup_otp'::text,
    'verify_pickup_otp'::text,
    'assign_awb'::text,
    'generate_label'::text,
    'generate_manifest'::text,
    'schedule_pickup'::text,
    'track_shipment'::text,
    'track_by_awb'::text,
    'cancel_order'::text,
    'cancel_shipment'::text,
    'create_return'::text,
    'ndr_reattempt'::text,
    'ndr_return_to_origin'::text,
    'sync_all_active_shipments'::text])));
