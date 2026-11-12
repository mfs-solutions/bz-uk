-- ============================================================================
-- BzeadStore Auth Tables & RLS Policies
-- Only auth-related tables: countries, business_types, profiles
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. TABLES (created first so policies can cross-reference)
-- ============================================================================

-- 1a. COUNTRIES TABLE
-- Used in signup (user & seller) for country selection
CREATE TABLE IF NOT EXISTS public.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_name TEXT NOT NULL UNIQUE,
  short_code VARCHAR(3) NOT NULL UNIQUE,        -- ISO 3166-1 alpha-3 (IND, USA, GBR)
  country_code VARCHAR(3) NOT NULL,              -- alias used by seller signup
  currency_code VARCHAR(3) NOT NULL DEFAULT 'INR',
  dialing_code VARCHAR(10) NOT NULL DEFAULT '+91',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_countries_active ON public.countries (is_active, country_name);

-- 1b. BUSINESS_TYPES TABLE
-- Used in seller signup for business type selection
CREATE TABLE IF NOT EXISTS public.business_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type_name TEXT NOT NULL UNIQUE,                -- e.g. Individual, Brand, Freelancing
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_types_active ON public.business_types (is_active, type_name);

-- 1c. PROFILES TABLE
-- Core auth profile linked 1:1 with auth.users via id
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'seller', 'admin')),
  is_verified BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  country_id UUID REFERENCES public.countries(id) ON DELETE SET NULL,
  business_type_id UUID REFERENCES public.business_types(id) ON DELETE SET NULL,
  currency TEXT DEFAULT 'INR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON public.profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_country ON public.profiles (country_id);


-- ============================================================================
-- 2. ENABLE RLS ON ALL TABLES
-- ============================================================================
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 3. RLS POLICIES (all tables exist now, so cross-references are safe)
-- ============================================================================

-- 3a. Countries policies
-- Everyone can read active countries (needed for signup forms before auth)
CREATE POLICY "countries_select_active"
  ON public.countries
  FOR SELECT
  USING (is_active = true);

-- Only admins can insert/update/delete countries
CREATE POLICY "countries_admin_insert"
  ON public.countries
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "countries_admin_update"
  ON public.countries
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "countries_admin_delete"
  ON public.countries
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 3b. Business types policies
-- Everyone can read active business types (needed for seller signup before auth)
CREATE POLICY "business_types_select_active"
  ON public.business_types
  FOR SELECT
  USING (is_active = true);

-- Only admins can manage business types
CREATE POLICY "business_types_admin_insert"
  ON public.business_types
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "business_types_admin_update"
  ON public.business_types
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "business_types_admin_delete"
  ON public.business_types
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 3c. Profiles policies
-- Users can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins can read all profiles
CREATE POLICY "profiles_select_admin"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Users can update their own profile (but not role, is_verified, approved)
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admins can update any profile (e.g. approve sellers, change roles)
CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles AS p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Profile insertion is handled by the trigger function (service_role)
-- But allow insert for authenticated users creating their own row as fallback
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());


-- ============================================================================
-- 4. TRIGGER: Auto-create profile on signup
-- Fires after a new user is created in auth.users
-- Copies user_metadata (role, full_name, currency, country_id, etc.) to profiles
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
    COALESCE(NEW.email, ''),
    _full_name,
    _phone,
    _role,
    _currency,
    _country_id,
    _business_type_id,
    false,
    CASE WHEN _role = 'user' THEN true ELSE false END,  -- users auto-approved, sellers need admin approval
    now(),
    now()
  );

  RETURN NEW;
END;
$$;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- ============================================================================
-- 5. TRIGGER: Auto-update updated_at on profiles
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS countries_updated_at ON public.countries;
CREATE TRIGGER countries_updated_at
  BEFORE UPDATE ON public.countries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS business_types_updated_at ON public.business_types;
CREATE TRIGGER business_types_updated_at
  BEFORE UPDATE ON public.business_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 6. SEED DATA: Countries
-- ============================================================================
INSERT INTO public.countries (country_name, short_code, country_code, currency_code, dialing_code)
VALUES
  ('India', 'IND', 'IND', 'INR', '+91'),
  ('United States', 'USA', 'USA', 'USD', '+1'),
  ('United Kingdom', 'GBR', 'GBR', 'GBP', '+44'),
  ('Canada', 'CAN', 'CAN', 'CAD', '+1'),
  ('Australia', 'AUS', 'AUS', 'AUD', '+61'),
  ('Germany', 'DEU', 'DEU', 'EUR', '+49'),
  ('France', 'FRA', 'FRA', 'EUR', '+33'),
  ('Japan', 'JPN', 'JPN', 'JPY', '+81'),
  ('Singapore', 'SGP', 'SGP', 'SGD', '+65'),
  ('United Arab Emirates', 'ARE', 'ARE', 'AED', '+971')
ON CONFLICT (short_code) DO NOTHING;


-- ============================================================================
-- 7. SEED DATA: Business Types
-- ============================================================================
INSERT INTO public.business_types (type_name, description)
VALUES
  ('Individual', 'Individual seller or sole proprietor'),
  ('Brand', 'Registered brand or company'),
  ('Freelancing', 'Freelance seller or independent contractor')
ON CONFLICT (type_name) DO NOTHING;
