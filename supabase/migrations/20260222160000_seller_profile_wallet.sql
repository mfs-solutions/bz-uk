-- ============================================================================
-- MIGRATION: Seller Profile extended fields + Wallet tables
-- ============================================================================

-- 1. Add seller-specific columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shop_description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS website TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS shop_address TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT NULL;

-- 2. Withdrawals table (tracks seller withdrawal requests)
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  bank_details JSONB DEFAULT NULL,
  notes TEXT DEFAULT '',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_seller ON public.withdrawals (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON public.withdrawals (status);

-- 3. Seller payouts table (tracks automatic payouts from platform)
CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  cycle_name TEXT NOT NULL DEFAULT '',
  cycle_start DATE,
  cycle_end DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  reference_id TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_payouts_seller ON public.seller_payouts (seller_id, created_at DESC);

-- 4. RLS for withdrawals
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.withdrawals TO authenticated;

-- Sellers can view their own withdrawals
CREATE POLICY withdrawals_select_own
  ON public.withdrawals FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- Sellers can insert their own withdrawals  
CREATE POLICY withdrawals_insert_own
  ON public.withdrawals FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());

-- Admins can view all withdrawals
CREATE POLICY withdrawals_admin_select
  ON public.withdrawals FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admins can update any withdrawal (approve/reject)
CREATE POLICY withdrawals_admin_update
  ON public.withdrawals FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. RLS for seller_payouts
ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.seller_payouts TO authenticated;

-- Sellers can view their own payouts
CREATE POLICY seller_payouts_select_own
  ON public.seller_payouts FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- Admins can view/insert/update all payouts
CREATE POLICY seller_payouts_admin_select
  ON public.seller_payouts FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY seller_payouts_admin_insert
  ON public.seller_payouts FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY seller_payouts_admin_update
  ON public.seller_payouts FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 6. Create storage bucket for seller logos (if not exists)
-- Note: Run this via Supabase Dashboard > Storage if INSERT INTO storage.buckets
-- is not allowed in migrations:
--   INSERT INTO storage.buckets (id, name, public) VALUES ('seller-logos', 'seller-logos', true)
--   ON CONFLICT (id) DO NOTHING;
