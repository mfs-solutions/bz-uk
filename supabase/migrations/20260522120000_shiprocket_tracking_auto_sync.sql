-- ============================================================
-- Shiprocket Tracking Auto-Sync — pg_cron + pg_net setup
--
-- Goal: keep buyer / seller / admin tracking views perfectly in
--       sync with Shiprocket without any manual refresh.
--
-- How it works:
--   pg_cron (every 15 min) →
--     pg_net HTTP POST →
--       Edge Function `shiprocket-ops` with
--         action: 'sync_all_active_shipments'
--         header: x-cron-secret: <secret stored in cron_runtime_settings>
--     → loops over active shiprocket_shipments
--     → calls Shiprocket /v1/external/courier/track/awb/...
--     → upserts shiprocket_tracking_events
--     → updates shiprocket_shipments.status and orders.status
--
-- Buyer (`OrderDetails.tsx`), seller (`SellerOrderManagement.tsx`)
-- and admin (`OrderManagement.tsx`) all read these same tables,
-- so updates propagate to every UI surface automatically.
--
-- The complementary push channel is the existing webhook
-- `intl-tracking-webhook` — point Shiprocket's tracking webhook
-- URL at it for near-real-time updates (cron is the safety net).
-- ============================================================

BEGIN;

-- 1. Required extensions ---------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Runtime settings table for cron-only secrets --------------------------
-- We store the shared secret that pg_cron sends in the `x-cron-secret`
-- header. The same value must also be set as the Edge Function secret
-- `SHIPROCKET_CRON_SECRET` (see RAISE NOTICE at the bottom).
CREATE TABLE IF NOT EXISTS public.cron_runtime_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);

-- Lock the table down: only service_role / pg superuser may read or write it.
ALTER TABLE public.cron_runtime_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cron_runtime_settings FROM PUBLIC;
REVOKE ALL ON public.cron_runtime_settings FROM anon;
REVOKE ALL ON public.cron_runtime_settings FROM authenticated;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.cron_runtime_settings TO service_role;

-- Seed the Shiprocket cron secret if it doesn't already exist.
INSERT INTO public.cron_runtime_settings (key, value)
VALUES ('shiprocket_cron_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 3. Helper that builds the cron-job body so pg_cron SQL stays tidy --------
CREATE OR REPLACE FUNCTION public.invoke_shiprocket_tracking_sync()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
-- pg_net lives in the `net` schema on Supabase (not `extensions`); pgcrypto/etc. stay in extensions.
SET search_path = public, net, extensions
AS $$
DECLARE
  v_secret      text;
  v_request_id  bigint;
BEGIN
  SELECT value INTO v_secret
    FROM public.cron_runtime_settings
   WHERE key = 'shiprocket_cron_secret';

  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE WARNING '[shiprocket-tracking-cron] missing shiprocket_cron_secret in cron_runtime_settings — skipping';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := 'https://aiiefgjfftmerayihpbv.supabase.co/functions/v1/shiprocket-ops',
    body    := jsonb_build_object(
                 'action',      'sync_all_active_shipments',
                 'requestData', jsonb_build_object('source', 'pg_cron')
               ),
    params  := '{}'::jsonb,
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-cron-secret',  v_secret
               ),
    timeout_milliseconds := 120000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_shiprocket_tracking_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_shiprocket_tracking_sync() FROM anon;
REVOKE ALL ON FUNCTION public.invoke_shiprocket_tracking_sync() FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.invoke_shiprocket_tracking_sync() TO service_role;

-- 4. (Re-)schedule the cron job (idempotent) -------------------------------
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('shiprocket-tracking-sync-every-15m');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist yet
  END;
END;
$$;

-- Every 15 minutes, around the clock.
SELECT cron.schedule(
  'shiprocket-tracking-sync-every-15m',
  '*/15 * * * *',
  $cron$
  SELECT public.invoke_shiprocket_tracking_sync();
  $cron$
);

-- 5. One-shot run so the first sync happens immediately on deploy ----------
SELECT public.invoke_shiprocket_tracking_sync();

COMMIT;

-- 6. Operator instructions -------------------------------------------------
-- After applying this migration you MUST copy the generated secret into the
-- Edge Function environment so `shiprocket-ops` accepts the cron caller:
--
--   1) Read the secret:
--        SELECT value
--          FROM public.cron_runtime_settings
--         WHERE key = 'shiprocket_cron_secret';
--
--   2) In Supabase Dashboard → Edge Functions → Secrets, set:
--        SHIPROCKET_CRON_SECRET = <value from step 1>
--
--   3) Redeploy / restart the `shiprocket-ops` function so it picks up
--      the new secret.
--
-- Verify the cron is running:
--   SELECT jobid, jobname, schedule, active
--     FROM cron.job
--    WHERE jobname = 'shiprocket-tracking-sync-every-15m';
--
--   SELECT runid, job_pid, start_time, end_time, return_message, status
--     FROM cron.job_run_details
--    WHERE jobid = (
--      SELECT jobid FROM cron.job
--       WHERE jobname = 'shiprocket-tracking-sync-every-15m'
--    )
--    ORDER BY start_time DESC
--    LIMIT 10;
--
-- Verify Shiprocket events are flowing in:
--   SELECT event_at, sr_status, activity, location
--     FROM public.shiprocket_tracking_events
--    ORDER BY created_at DESC
--    LIMIT 20;
