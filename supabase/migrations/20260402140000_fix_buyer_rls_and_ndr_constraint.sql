-- Fix CRITICAL: Buyer cannot see Shiprocket tracking data
-- RLS on shiprocket_shipments and shiprocket_tracking_events only allows
-- seller_id = auth.uid() — buyers (who are NOT the seller) get empty results.
-- Fix: Add read-only policies that allow buyers to see shipments for their own orders.

-- shiprocket_shipments: buyers can SELECT rows for orders they own
DROP POLICY IF EXISTS shiprocket_shipments_buyer_select ON public.shiprocket_shipments;
CREATE POLICY shiprocket_shipments_buyer_select
  ON public.shiprocket_shipments FOR SELECT TO authenticated
  USING (
    order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = shiprocket_shipments.order_id
        AND o.user_id = auth.uid()
    )
  );

-- shiprocket_tracking_events: buyers can SELECT events for shipments on their orders
DROP POLICY IF EXISTS shiprocket_tracking_events_buyer_select ON public.shiprocket_tracking_events;
CREATE POLICY shiprocket_tracking_events_buyer_select
  ON public.shiprocket_tracking_events FOR SELECT TO authenticated
  USING (
    shipment_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.shiprocket_shipments ss
      JOIN public.orders o ON o.id = ss.order_id
      WHERE ss.id = shiprocket_tracking_events.shipment_id
        AND o.user_id = auth.uid()
    )
  );

-- Fix CRITICAL: CHECK constraint blocks NDR operation logging
-- The existing constraint doesn't include ndr_reattempt / ndr_return_to_origin
-- Drop and re-create with the new operation names
ALTER TABLE public.shiprocket_operation_logs
  DROP CONSTRAINT IF EXISTS shiprocket_operation_logs_operation_check;

ALTER TABLE public.shiprocket_operation_logs
  ADD CONSTRAINT shiprocket_operation_logs_operation_check
  CHECK (
    operation IN (
      'authenticate',
      'check_international_serviceability',
      'create_international_order',
      'create_order',
      'add_pickup_location',
      'get_pickup_locations',
      'assign_awb',
      'generate_label',
      'generate_manifest',
      'schedule_pickup',
      'track_shipment',
      'track_by_awb',
      'cancel_order',
      'cancel_shipment',
      'create_return',
      'ndr_reattempt',
      'ndr_return_to_origin',
      'sync_all_active_shipments'
    )
  );
