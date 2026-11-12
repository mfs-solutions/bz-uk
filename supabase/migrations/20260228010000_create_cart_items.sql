-- ============================================================
-- Migration: Create cart_items table with variant support
-- Date: 2026-02-28
-- Description: Stores per-user cart items with size/color variant
--              info so backend sync preserves variant selections.
-- ============================================================

-- Drop if recreating (safe for first run)
DROP TABLE IF EXISTS public.cart_items;

CREATE TABLE public.cart_items (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity      integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  selected_size text,          -- e.g. 'S', 'M', 'L', 'XL'
  selected_color text,         -- e.g. 'Red', 'Blue'
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- Each user can have one row per product+size+color combo
  CONSTRAINT cart_items_unique_variant
    UNIQUE (user_id, product_id, selected_size, selected_color)
);

-- Indexes for fast lookups
CREATE INDEX idx_cart_items_user_id ON public.cart_items(user_id);
CREATE INDEX idx_cart_items_product_id ON public.cart_items(product_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION public.fn_cart_items_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cart_items_updated_at
  BEFORE UPDATE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_cart_items_updated_at();

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Users can only see their own cart items
CREATE POLICY "Users can view own cart items"
  ON public.cart_items FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own cart items
CREATE POLICY "Users can insert own cart items"
  ON public.cart_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own cart items
CREATE POLICY "Users can update own cart items"
  ON public.cart_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own cart items
CREATE POLICY "Users can delete own cart items"
  ON public.cart_items FOR DELETE
  USING (auth.uid() = user_id);
