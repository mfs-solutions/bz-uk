-- ============================================================================
-- MIGRATION: Monthly 2-Cycle Seller Settlement System
-- Adds settlement breakdown columns to orders + seller_settlements table
-- ============================================================================

BEGIN;

-- 1. Add settlement columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_subtotal NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS platform_fee     NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS seller_earning   NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS settlement_cycle TEXT,
  ADD COLUMN IF NOT EXISTS settlement_status TEXT DEFAULT 'pending';

-- 2. Create seller_settlements table (records per-cycle payout totals)
CREATE TABLE IF NOT EXISTS public.seller_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cycle TEXT NOT NULL,
  cycle_label TEXT NOT NULL DEFAULT '',
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_product_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_platform_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_seller_earning NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seller_settlements_seller
  ON public.seller_settlements (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seller_settlements_cycle
  ON public.seller_settlements (cycle, status);

-- 3. Index on orders for settlement queries
CREATE INDEX IF NOT EXISTS idx_orders_settlement
  ON public.orders (seller_id, settlement_cycle, settlement_status, status);

-- 4. RLS for seller_settlements
ALTER TABLE public.seller_settlements ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.seller_settlements TO authenticated;

-- Sellers can view their own settlements
CREATE POLICY seller_settlements_select_own
  ON public.seller_settlements FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- Admins full access
CREATE POLICY seller_settlements_admin_all
  ON public.seller_settlements FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 5. Backfill existing delivered orders with settlement data
-- product_subtotal = sum of order_items (price * quantity) for the seller's items
-- platform_fee = 9% of product_subtotal
-- seller_earning = product_subtotal - platform_fee
-- settlement_cycle = CYCLE_1 if day 1-15, CYCLE_2 if day 16+
UPDATE public.orders o
SET
  product_subtotal = sub.item_total,
  platform_fee = ROUND(sub.item_total * 0.09, 2),
  seller_earning = ROUND(sub.item_total - (sub.item_total * 0.09), 2),
  settlement_cycle = CASE
    WHEN EXTRACT(DAY FROM o.created_at) <= 15 THEN 'CYCLE_1'
    ELSE 'CYCLE_2'
  END,
  settlement_status = CASE
    WHEN o.status = 'delivered' THEN 'pending'
    WHEN o.status IN ('cancelled', 'returned', 'refunded') THEN 'cancelled'
    ELSE 'pending'
  END
FROM (
  SELECT order_id, COALESCE(SUM(price * quantity), 0) AS item_total
  FROM public.order_items
  GROUP BY order_id
) sub
WHERE sub.order_id = o.id
  AND o.product_subtotal IS NULL;

COMMIT;
