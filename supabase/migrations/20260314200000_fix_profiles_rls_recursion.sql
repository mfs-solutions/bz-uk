-- =============================================================================
-- FIX: infinite recursion in RLS policies on "profiles" table
-- 
-- Problem: Admin policies on profiles do SELECT FROM profiles in their USING
-- clause, which triggers the same RLS policies again → infinite recursion.
--
-- Solution: Create a SECURITY DEFINER function that checks admin status
-- without triggering RLS, then rewrite the recursive policies to use it.
-- =============================================================================

-- 1. Create a SECURITY DEFINER helper that bypasses RLS on profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 2. Drop the 3 recursive policies

-- From auth_tables.sql
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

-- From 20260314000000_create_missing_core_tables.sql
DROP POLICY IF EXISTS "Admins full access on profiles" ON public.profiles;

-- 3. Re-create them using the safe is_admin() function

CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ( public.is_admin() );

CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ( public.is_admin() )
  WITH CHECK ( public.is_admin() );

CREATE POLICY "Admins full access on profiles"
  ON public.profiles
  FOR ALL
  USING ( public.is_admin() );
