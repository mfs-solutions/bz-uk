-- Automated log cleanup for Shiprocket tables
-- Prevents unbounded table growth over months of operation
-- Deletes old operation logs and webhook events (data is ephemeral/debug-only)

-- 1. Create cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_shiprocket_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_ops INTEGER;
  deleted_webhook INTEGER;
BEGIN
  -- Delete operation logs older than 30 days
  DELETE FROM public.shiprocket_operation_logs
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_ops = ROW_COUNT;

  -- Delete webhook events older than 30 days
  DELETE FROM public.shiprocket_webhook_events
  WHERE created_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS deleted_webhook = ROW_COUNT;

  -- Delete tracking events older than 90 days (keep longer for buyer visibility)
  -- Only delete events for terminal shipments (delivered, cancelled, rto)
  DELETE FROM public.shiprocket_tracking_events
  WHERE created_at < NOW() - INTERVAL '90 days'
    AND shipment_id IN (
      SELECT id FROM public.shiprocket_shipments
      WHERE status IN ('delivered', 'cancelled', 'rto')
    );

  RAISE LOG 'shiprocket_cleanup: deleted % op_logs, % webhook_events', deleted_ops, deleted_webhook;
END;
$$;

-- 2. Schedule via pg_cron (runs daily at 03:00 UTC)
-- pg_cron must be enabled on the Supabase project (Dashboard > Database > Extensions > pg_cron)
-- If pg_cron is not available, run this function manually or via a scheduled edge function.
DO $$
BEGIN
  -- Only create the cron job if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('shiprocket-log-cleanup');
    PERFORM cron.schedule(
      'shiprocket-log-cleanup',
      '0 3 * * *',
      'SELECT public.cleanup_shiprocket_logs()'
    );
  ELSE
    RAISE NOTICE 'pg_cron not available — enable it in Supabase dashboard, then run: SELECT cron.schedule(''shiprocket-log-cleanup'', ''0 3 * * *'', ''SELECT public.cleanup_shiprocket_logs()'');';
  END IF;
END;
$$;
