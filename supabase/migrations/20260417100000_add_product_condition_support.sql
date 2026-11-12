-- =============================================================
-- Migration: Add used/refurbished product condition support
-- Adds item_condition column to products (DEFAULT 'brand_new')
-- Creates product_condition_details table (used/refurbished info)
-- Creates product_return_policies table (seller return policy)
-- =============================================================

-- 1. Add item_condition column to products table
--    DEFAULT 'brand_new' ensures all existing products are safe.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS item_condition text NOT NULL DEFAULT 'brand_new';

-- Add CHECK constraint separately (idempotent via IF NOT EXISTS pattern)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_item_condition_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_item_condition_check
      CHECK (item_condition IN (
        'brand_new',
        'used_open_box',
        'used_like_new',
        'used_very_good',
        'used_good',
        'used_acceptable',
        'refurbished'
      ));
  END IF;
END $$;


-- 2. Create product_condition_details table
CREATE TABLE IF NOT EXISTS public.product_condition_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  usage_duration text NOT NULL CHECK (usage_duration IN (
    'less_than_1_month', '1_6_months', '6_12_months', '1_2_years', '2_plus_years'
  )),
  working_condition text NOT NULL CHECK (working_condition IN (
    'works_perfectly', 'minor_issues', 'needs_repair'
  )),
  working_condition_notes text DEFAULT '',
  original_packaging boolean NOT NULL DEFAULT false,
  original_invoice boolean NOT NULL DEFAULT false,
  accessories_included text DEFAULT '',
  ownership_type text NOT NULL CHECK (ownership_type IN (
    'first_owner', 'second_owner', 'multiple_owners'
  )),
  has_scratches boolean NOT NULL DEFAULT false,
  scratch_description text DEFAULT '',
  scratch_images text[] DEFAULT '{}',
  refurbished_by text CHECK (refurbished_by IS NULL OR refurbished_by IN (
    'brand_authorized', 'local_technician', 'self_refurbished'
  )),
  repair_details text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_product_condition UNIQUE (product_id)
);

-- RLS for product_condition_details
ALTER TABLE public.product_condition_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read condition details"
  ON public.product_condition_details FOR SELECT USING (true);

CREATE POLICY "Sellers manage own condition details"
  ON public.product_condition_details FOR ALL
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id = auth.uid()))
  WITH CHECK (product_id IN (SELECT id FROM public.products WHERE seller_id = auth.uid()));


-- 3. Create product_return_policies table
CREATE TABLE IF NOT EXISTS public.product_return_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  accepts_returns boolean NOT NULL DEFAULT false,
  return_window text CHECK (return_window IS NULL OR return_window IN (
    '24_hours', '48_hours', '3_days', '5_days'
  )),
  accepted_return_reasons text[] DEFAULT '{}',
  return_shipping_by text CHECK (return_shipping_by IS NULL OR return_shipping_by IN (
    'seller', 'buyer'
  )),
  refund_type text CHECK (refund_type IS NULL OR refund_type IN (
    'full_refund', 'partial_refund', 'replacement'
  )),
  proof_requirement text CHECK (proof_requirement IS NULL OR proof_requirement IN (
    'unboxing_video', 'photos', 'none'
  )),
  return_condition_agreed boolean NOT NULL DEFAULT false,
  seller_responsibility_agreed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_product_return_policy UNIQUE (product_id)
);

-- RLS for product_return_policies
ALTER TABLE public.product_return_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read return policies"
  ON public.product_return_policies FOR SELECT USING (true);

CREATE POLICY "Sellers manage own return policies"
  ON public.product_return_policies FOR ALL
  USING (product_id IN (SELECT id FROM public.products WHERE seller_id = auth.uid()))
  WITH CHECK (product_id IN (SELECT id FROM public.products WHERE seller_id = auth.uid()));
