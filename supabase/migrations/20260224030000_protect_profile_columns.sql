-- ============================================================================
-- Migration: Protect profile columns from privilege escalation
-- Prevents non-admin users from changing role, is_verified, approved columns
-- ============================================================================

-- BEFORE UPDATE trigger that silently resets protected columns to their old
-- values when the caller is not an admin.  This makes the existing
-- profiles_update_own RLS policy safe — users can update their own name,
-- phone, avatar etc. but cannot escalate privileges.
CREATE OR REPLACE FUNCTION public.protect_profile_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins to change any column
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  -- Non-admin: silently revert protected columns to their old values
  NEW.role := OLD.role;
  NEW.is_verified := OLD.is_verified;
  NEW.approved := OLD.approved;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_columns();
