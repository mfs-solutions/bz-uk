-- Add unique constraints for Shiprocket tracking dedup
-- These enforce at the DB level what the application already checks in code

-- Prevent duplicate tracking events (same shipment + event time + status)
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_tracking_events_dedup
  ON shiprocket_tracking_events (shipment_id, event_at, sr_status);

-- Prevent duplicate webhook events (same AWB + status ID)
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_webhook_events_dedup
  ON shiprocket_webhook_events (awb_number, current_status_id);
