-- ============================================================================
-- Migration: Harden shiprocket_auth_tokens access
-- RLS was already enabled (no policies = deny all), but add explicit deny
-- policy and REVOKE to document intent and be resilient against future GRANTs.
-- ============================================================================

-- RLS already enabled in 20260401000000; this is idempotent
ALTER TABLE public.shiprocket_auth_tokens ENABLE ROW LEVEL SECURITY;

-- Explicit deny for all client roles (service_role bypasses RLS automatically)
DROP POLICY IF EXISTS shiprocket_auth_tokens_deny_all ON public.shiprocket_auth_tokens;
CREATE POLICY shiprocket_auth_tokens_deny_all
  ON public.shiprocket_auth_tokens
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Remove any direct client privileges
REVOKE ALL ON public.shiprocket_auth_tokens FROM authenticated, anon;
