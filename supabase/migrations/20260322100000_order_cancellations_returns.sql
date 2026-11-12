-- ============================================================
-- Order Cancellations & Returns tables + order column additions
-- Enables Amazon-level cancel/return/refund lifecycle tracking
-- ============================================================

-- 1. Add cancellation and return tracking columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Order cancellations table (detailed audit trail)
CREATE TABLE IF NOT EXISTS public.order_cancellations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cancelled_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('buyer', 'seller', 'admin')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'cancelled' CHECK (status IN ('cancelled', 'rejected_by_seller')),
  refund_status TEXT NOT NULL DEFAULT 'pending' CHECK (refund_status IN ('pending', 'processing', 'completed', 'not_applicable')),
  refund_amount NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Order returns table (per-item return requests)
CREATE TABLE IF NOT EXISTS public.order_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
    'requested', 'approved', 'rejected', 'pickup_scheduled',
    'in_transit', 'received', 'inspected', 'refund_initiated', 'refund_completed', 'closed'
  )),
  quantity INTEGER NOT NULL DEFAULT 1,
  refund_amount NUMERIC(12,2) DEFAULT 0,
  seller_response TEXT,
  admin_notes TEXT,
  pickup_tracking TEXT,
  images TEXT[] DEFAULT '{}',
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Order status history table (audit trail for every status change)
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  role TEXT CHECK (role IN ('buyer', 'seller', 'admin', 'system')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. RLS policies

ALTER TABLE public.order_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- order_cancellations
CREATE POLICY "Users read own cancellations" ON public.order_cancellations
  FOR SELECT USING (
    cancelled_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Users insert own cancellations" ON public.order_cancellations
  FOR INSERT WITH CHECK (cancelled_by = auth.uid());
CREATE POLICY "Admins full access on order_cancellations" ON public.order_cancellations
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
CREATE POLICY "Sellers read cancellations for their orders" ON public.order_cancellations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = order_cancellations.order_id AND oi.seller_id = auth.uid()
    )
  );

-- order_returns
CREATE POLICY "Users read own returns" ON public.order_returns
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own returns" ON public.order_returns
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Sellers read returns for their orders" ON public.order_returns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = order_returns.order_id AND oi.seller_id = auth.uid()
    )
  );
CREATE POLICY "Sellers update returns for their orders" ON public.order_returns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = order_returns.order_id AND oi.seller_id = auth.uid()
    )
  );
CREATE POLICY "Admins full access on order_returns" ON public.order_returns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- order_status_history
CREATE POLICY "Users read own order history" ON public.order_status_history
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid())
  );
CREATE POLICY "Sellers read order history for their orders" ON public.order_status_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = order_status_history.order_id AND oi.seller_id = auth.uid()
    )
  );
CREATE POLICY "Admins full access on order_status_history" ON public.order_status_history
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
CREATE POLICY "Any authenticated user inserts order history" ON public.order_status_history
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_order_cancellations_order_id ON public.order_cancellations(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_order_id ON public.order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_user_id ON public.order_returns(user_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_status ON public.order_returns(status);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);
