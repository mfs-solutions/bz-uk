-- Fix webhook event dedup constraint:
-- Old: (awb_number, current_status_id) — too restrictive, drops valid repeat status events
-- New: no unique constraint on webhook_events (dedup is handled in application code with
-- payload comparison). Drop the old constraint.

DROP INDEX IF EXISTS uq_shiprocket_webhook_events_dedup;

-- Fix tracking event dedup constraint:
-- Old: (shipment_id, event_at, sr_status) — drops valid events at same time with same status
-- but different locations (e.g. hub transfer scans)
-- New: include location in the uniqueness check
DROP INDEX IF EXISTS uq_shiprocket_tracking_events_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_tracking_events_dedup
  ON shiprocket_tracking_events (shipment_id, event_at, sr_status, location);
