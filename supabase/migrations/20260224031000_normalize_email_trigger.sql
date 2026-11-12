-- ============================================================================
-- Migration: Normalize email in handle_new_user trigger
-- Ensures profiles.email is always stored as lowercase/trimmed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role TEXT;
  _full_name TEXT;
  _currency TEXT;
  _phone TEXT;
  _country_id UUID;
  _business_type_id UUID;
BEGIN
  -- SECURITY: Infer role from signup data pattern instead of trusting frontend.
  -- Seller signup always provides business_type_id; user signup does not.
  BEGIN
    _business_type_id := (NEW.raw_user_meta_data ->> 'business_type_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    _business_type_id := NULL;
  END;

  IF _business_type_id IS NOT NULL THEN
    _role := 'seller';
  ELSE
    _role := 'user';
  END IF;

  _full_name := COALESCE(NEW.raw_user_meta_data ->> 'full_name', '');
  _currency := COALESCE(NEW.raw_user_meta_data ->> 'currency', 'INR');
  _phone := COALESCE(NEW.raw_user_meta_data ->> 'phone', '');

  -- Safely cast country_id (may be null or invalid)
  BEGIN
    _country_id := (NEW.raw_user_meta_data ->> 'country_id')::UUID;
  EXCEPTION WHEN OTHERS THEN
    _country_id := NULL;
  END;

  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    currency,
    country_id,
    business_type_id,
    is_verified,
    approved,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    LOWER(TRIM(COALESCE(NEW.email, ''))),
    _full_name,
    _phone,
    _role,
    _currency,
    _country_id,
    _business_type_id,
    false,
    CASE WHEN _role = 'user' THEN true ELSE false END,
    now(),
    now()
  );

  RETURN NEW;
END;
$$;
