-- ============================================================================
-- Migration: Fix protect_profile_columns trigger
-- 1. Add is_banned to the list of protected columns (prevents self-unban)
-- 2. Replace inline admin check with is_admin() helper (avoids RLS recursion)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins can change any column
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  -- Non-admin: silently revert protected columns to their old values
  NEW.role        := OLD.role;
  NEW.is_verified := OLD.is_verified;
  NEW.approved    := OLD.approved;
  NEW.is_banned   := OLD.is_banned;   -- prevent self-unban

  RETURN NEW;
END;
$$;
