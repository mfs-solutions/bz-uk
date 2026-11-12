-- ============================================================
-- Security: Admin-only RPCs for role management
-- These SECURITY DEFINER functions verify the caller is an admin
-- before allowing role changes, preventing privilege escalation.
-- ============================================================

-- 1. Promote a user to admin (only callable by existing admin)
CREATE OR REPLACE FUNCTION public.admin_promote_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- Prevent self-promotion loops (already admin)
  IF EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is already an admin');
  END IF;

  -- Verify target user exists
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User not found');
  END IF;

  UPDATE profiles SET role = 'admin' WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Demote a user from admin (only callable by existing admin)
CREATE OR REPLACE FUNCTION public.admin_demote_user(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- Prevent demoting yourself
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot demote yourself');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not an admin');
  END IF;

  UPDATE profiles SET role = 'user' WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Admin update seller KYC status (guarantees admin-only at DB level)
CREATE OR REPLACE FUNCTION public.admin_update_seller_kyc(
  p_seller_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE seller_kyc
  SET kyc_status = p_status,
      rejection_reason = p_reason,
      verified_at = now()
  WHERE seller_id = p_seller_id;

  -- Sync verified/approved status on profiles
  UPDATE profiles
  SET is_verified = (p_status = 'approved'),
      approved = (p_status = 'approved')
  WHERE id = p_seller_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Admin update seller badge
CREATE OR REPLACE FUNCTION public.admin_update_seller_badge(
  p_seller_id UUID,
  p_badge TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  UPDATE profiles SET badge = p_badge WHERE id = p_seller_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Grant execute to authenticated users (auth checks happen inside the functions)
GRANT EXECUTE ON FUNCTION public.admin_promote_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_demote_user TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_seller_kyc TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_seller_badge TO authenticated;
