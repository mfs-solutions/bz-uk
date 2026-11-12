-- ============================================================
-- Fix exchange rate cron job: extensions.http_post → net.http_post
--
-- The previous migration (20260505150000) scheduled the cron job using
-- extensions.http_post, but Supabase installs pg_net in the "net" schema.
-- Every hourly run has been failing with:
--   "function extensions.http_post(...) does not exist"
--
-- This migration reschedules the job using net.http_post (positional args).
-- ============================================================

-- Drop and recreate the cron job with the correct schema
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('sync-exchange-rates-hourly');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

-- Every hour at minute 5 UTC — uses net.http_post (positional args, no JWT needed)
SELECT cron.schedule(
  'sync-exchange-rates-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    'https://aiiefgjfftmerayihpbv.supabase.co/functions/v1/sync-exchange-rates',
    '{}'::jsonb,
    '{}'::jsonb,
    '{"Content-Type": "application/json"}'::jsonb,
    30000
  ) AS request_id;
  $$
);
