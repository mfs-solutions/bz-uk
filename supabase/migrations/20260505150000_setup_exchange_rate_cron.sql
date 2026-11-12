-- ============================================================
-- Exchange Rate Auto-Sync — pg_net + pg_cron setup
-- Runs every hour at :05 UTC via pg_cron → pg_net HTTP POST
-- → sync-exchange-rates Edge Function
-- → fetches from ExchangeRate-API (primary) / open.er-api.com (fallback)
-- → overwrites exchange_rate column on all matching countries rows
-- ============================================================

-- 1. Enable extensions (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;

-- 2. Helper RPC function called by the Edge Function
--    Accepts a JSON object of { "USD": 1, "INR": 95.2, ... }
--    and does a single bulk UPDATE — returns rows updated count.
--
--    SECURITY DEFINER + REVOKE PUBLIC = only service_role can call this.
CREATE OR REPLACE FUNCTION public.update_exchange_rates(rates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE countries
  SET
    exchange_rate = (rates ->> currency_code)::numeric,
    updated_at    = NOW()
  WHERE
    currency_code IS NOT NULL
    AND (rates ? currency_code);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

-- Restrict: only service_role (Edge Function with service key) can call this
REVOKE ALL ON FUNCTION public.update_exchange_rates(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_exchange_rates(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.update_exchange_rates(jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.update_exchange_rates(jsonb) TO service_role;

-- 3. Schedule hourly cron job (idempotent — removes old job if it exists)
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('sync-exchange-rates-hourly');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job did not exist yet, fine
  END;
END;
$$;

-- Every hour at minute 5 UTC  (e.g. 00:05, 01:05, ... 23:05 UTC)
-- IST offset +5:30 → runs at 05:35, 06:35, ... IST
SELECT cron.schedule(
  'sync-exchange-rates-hourly',
  '5 * * * *',
  $$
  SELECT extensions.http_post(
    url         := 'https://aiiefgjfftmerayihpbv.supabase.co/functions/v1/sync-exchange-rates',
    body        := '{}'::jsonb,
    params      := '{}'::jsonb,
    headers     := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 30000
  ) AS request_id;
  $$
);
