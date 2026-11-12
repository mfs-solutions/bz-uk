-- ============================================================================
-- Migration: User location cache for geolocation + reverse geocoding
-- Stores daily-resolved city/state/country per authenticated user
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_location_cache (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  place text,
  city text,
  state text,
  country text NOT NULL,
  country_code text,
  provider text,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_location_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_location_cache_select_own ON public.user_location_cache;
CREATE POLICY user_location_cache_select_own
ON public.user_location_cache
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_location_cache_insert_own ON public.user_location_cache;
CREATE POLICY user_location_cache_insert_own
ON public.user_location_cache
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_location_cache_update_own ON public.user_location_cache;
CREATE POLICY user_location_cache_update_own
ON public.user_location_cache
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS user_location_cache_delete_own ON public.user_location_cache;
CREATE POLICY user_location_cache_delete_own
ON public.user_location_cache
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_location_cache_resolved_at
ON public.user_location_cache(resolved_at DESC);

CREATE OR REPLACE FUNCTION public.set_user_location_cache_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_location_cache_updated_at ON public.user_location_cache;
CREATE TRIGGER trg_user_location_cache_updated_at
BEFORE UPDATE ON public.user_location_cache
FOR EACH ROW EXECUTE FUNCTION public.set_user_location_cache_updated_at();
