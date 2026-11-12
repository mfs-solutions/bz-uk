-- ============================================================
-- SECURE SELLER WALLET + 2-CYCLE SETTLEMENT SYSTEM
-- Phase 1-10: Backend-controlled financial logic
-- ============================================================

-- ============================================================
-- PHASE 3: WALLET LEDGER TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS seller_wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL,
  order_id UUID REFERENCES orders(id),
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  source TEXT NOT NULL CHECK (source IN ('order', 'refund', 'withdrawal', 'adjustment')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_txn_seller
  ON seller_wallet_transactions(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_order
  ON seller_wallet_transactions(order_id);

-- RLS: sellers read own, no direct writes
ALTER TABLE seller_wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers read own wallet txns" ON seller_wallet_transactions;
CREATE POLICY "Sellers read own wallet txns"
  ON seller_wallet_transactions FOR SELECT
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all wallet txns" ON seller_wallet_transactions;
CREATE POLICY "Admins read all wallet txns"
  ON seller_wallet_transactions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Block all direct inserts from client — only server functions can write
DROP POLICY IF EXISTS "Block direct wallet inserts" ON seller_wallet_transactions;
CREATE POLICY "Block direct wallet inserts"
  ON seller_wallet_transactions FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Block direct wallet updates" ON seller_wallet_transactions;
CREATE POLICY "Block direct wallet updates"
  ON seller_wallet_transactions FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "Block direct wallet deletes" ON seller_wallet_transactions;
CREATE POLICY "Block direct wallet deletes"
  ON seller_wallet_transactions FOR DELETE
  USING (false);


-- ============================================================
-- PHASE 2: SECURE ORDER CREATION FUNCTION
-- All financial fields computed server-side from real DB prices
-- ============================================================
-- ─────────────────────────────────────────────────────────────────────────────
-- SUPERSEDED — DO NOT RE-RUN THIS DEFINITION ON ITS OWN.
-- Canonical create_order_secure = 20260527120000_restore_server_fx_create_order_secure.sql
-- This older body does NOT derive FX correctly from countries.exchange_rate
-- (it predates server-side FX or defaults v_fx to 1), so applying it in isolation
-- silently mislabels foreign-currency order totals (the ORD-1779833529 FX bug).
-- In-order migration replay is safe; only a manual re-run of THIS file is dangerous.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_order_secure(
  p_user_id UUID,
  p_items JSONB,
  p_shipping_address JSONB DEFAULT NULL,
  p_billing_address JSONB DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_payment_intent_id TEXT DEFAULT NULL,
  p_payment_method TEXT DEFAULT 'card',
  p_payment_status TEXT DEFAULT 'pending',
  p_order_status TEXT DEFAULT 'pending',
  p_currency TEXT DEFAULT 'INR',
  p_shipping_charge NUMERIC DEFAULT 0,
  p_actual_shipping_cost NUMERIC DEFAULT 0,
  p_platform_shipping_margin NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_product_subtotal NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
  v_seller_earning NUMERIC := 0;
  v_total_amount NUMERIC := 0;
  v_settlement_cycle TEXT;
  v_order_id UUID;
  v_order_number TEXT;
  v_seller_id UUID;
  v_real_price NUMERIC;
  v_distinct_sellers UUID[];
BEGIN
  -- Auth check: caller must match p_user_id
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user mismatch';
  END IF;

  -- Validate items
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  -- Calculate product_subtotal from REAL DB prices (not client prices)
  SELECT COALESCE(SUM(p.price * (item->>'quantity')::INT), 0)
  INTO v_product_subtotal
  FROM jsonb_array_elements(p_items) item
  JOIN products p ON p.id = (item->>'product_id')::UUID;

  IF v_product_subtotal <= 0 THEN
    RAISE EXCEPTION 'Invalid product subtotal: no valid products found';
  END IF;

  -- 9% platform commission
  v_platform_fee := ROUND(v_product_subtotal * 0.09, 2);
  v_seller_earning := ROUND(v_product_subtotal - v_platform_fee, 2);
  v_total_amount := v_product_subtotal + COALESCE(p_shipping_charge, 0);

  -- Settlement cycle
  IF EXTRACT(DAY FROM now()) <= 15 THEN
    v_settlement_cycle := 'CYCLE_1';
  ELSE
    v_settlement_cycle := 'CYCLE_2';
  END IF;

  -- Generate order number
  v_order_number := 'ORD-' || EXTRACT(EPOCH FROM now())::BIGINT || '-' || LEFT(gen_random_uuid()::TEXT, 8);

  -- Resolve seller_id: single-seller → set on order, multi-seller → NULL
  SELECT ARRAY_AGG(DISTINCT p.seller_id)
  INTO v_distinct_sellers
  FROM jsonb_array_elements(p_items) item
  JOIN products p ON p.id = (item->>'product_id')::UUID
  WHERE p.seller_id IS NOT NULL;

  IF array_length(v_distinct_sellers, 1) = 1 THEN
    v_seller_id := v_distinct_sellers[1];
  ELSE
    v_seller_id := NULL;
  END IF;

  -- Insert order row
  INSERT INTO orders (
    user_id, seller_id, status, payment_status,
    total_amount, currency, shipping_address, billing_address,
    phone, notes, order_number, payment_intent_id, payment_method,
    shipping_charge, actual_shipping_cost, platform_shipping_margin,
    product_subtotal, platform_fee, seller_earning,
    settlement_cycle, settlement_status
  ) VALUES (
    p_user_id, v_seller_id, p_order_status, p_payment_status,
    v_total_amount, p_currency, p_shipping_address, p_billing_address,
    p_phone, p_notes, v_order_number, p_payment_intent_id, p_payment_method,
    COALESCE(p_shipping_charge, 0), COALESCE(p_actual_shipping_cost, 0), COALESCE(p_platform_shipping_margin, 0),
    v_product_subtotal, v_platform_fee, v_seller_earning,
    v_settlement_cycle, 'pending'
  )
  RETURNING id INTO v_order_id;

  -- Insert order_items with real prices, resolved seller_ids, and product data
  INSERT INTO order_items (
    order_id, product_id, product_name, product_image,
    quantity, price, seller_id, variant_info
  )
  SELECT
    v_order_id,
    (item->>'product_id')::UUID,
    COALESCE(NULLIF(item->>'product_name', ''), p.name),
    COALESCE(NULLIF(item->>'product_image', ''), p.image_url, ''),
    (item->>'quantity')::INT,
    p.price,
    p.seller_id,
    jsonb_build_object(
      'size', item->'variant_info'->>'size',
      'color', item->'variant_info'->>'color',
      'sku', COALESCE(item->'variant_info'->>'sku', p.sku),
      'hsn_code', COALESCE(item->'variant_info'->>'hsn_code', p.hsn_code),
      'expected_delivery_days', NULL
    )
  FROM jsonb_array_elements(p_items) item
  JOIN products p ON p.id = (item->>'product_id')::UUID;

  -- Return order data
  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_total_amount,
    'product_subtotal', v_product_subtotal,
    'platform_fee', v_platform_fee,
    'seller_earning', v_seller_earning,
    'settlement_cycle', v_settlement_cycle,
    'settlement_status', 'pending',
    'status', p_order_status,
    'payment_status', p_payment_status,
    'currency', p_currency,
    'created_at', now()
  );
END;
$$;


-- ============================================================
-- PHASE 4: AUTO-CREDIT SELLER ON DELIVERY (per order_item)
-- Handles multi-seller orders correctly
-- ============================================================
CREATE OR REPLACE FUNCTION credit_seller_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when status changes TO 'delivered'
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN

    -- Credit each seller for their portion (per order_item)
    -- Prevents double-credit: skip if credit already exists for this order
    INSERT INTO seller_wallet_transactions (seller_id, order_id, type, source, amount)
    SELECT
      oi.seller_id,
      NEW.id,
      'credit',
      'order',
      ROUND(SUM(oi.price * oi.quantity) * 0.91, 2)  -- 91% after 9% fee
    FROM order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.seller_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM seller_wallet_transactions wt
        WHERE wt.order_id = NEW.id
          AND wt.seller_id = oi.seller_id
          AND wt.type = 'credit'
          AND wt.source = 'order'
      )
    GROUP BY oi.seller_id;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_delivered ON orders;
CREATE TRIGGER on_order_delivered
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION credit_seller_on_delivery();


-- ============================================================
-- PHASE 5: DEBIT ON REFUND/CANCEL (only if previously credited)
-- ============================================================
CREATE OR REPLACE FUNCTION debit_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire when status changes TO cancelled/returned/refunded
  IF NEW.status IN ('cancelled', 'returned', 'refunded')
     AND OLD.status IS DISTINCT FROM NEW.status THEN

    -- Debit each seller who was credited for this order
    -- Prevents double-debit: skip if debit already exists
    INSERT INTO seller_wallet_transactions (seller_id, order_id, type, source, amount)
    SELECT
      wt.seller_id,
      NEW.id,
      'debit',
      'refund',
      wt.amount
    FROM seller_wallet_transactions wt
    WHERE wt.order_id = NEW.id
      AND wt.type = 'credit'
      AND wt.source = 'order'
      AND NOT EXISTS (
        SELECT 1 FROM seller_wallet_transactions wt2
        WHERE wt2.order_id = NEW.id
          AND wt2.seller_id = wt.seller_id
          AND wt2.type = 'debit'
          AND wt2.source = 'refund'
      );

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_refund ON orders;
CREATE TRIGGER on_order_refund
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION debit_on_refund();


-- ============================================================
-- PHASE 6: REAL WALLET BALANCE (ledger-based)
-- ============================================================
CREATE OR REPLACE FUNCTION get_seller_wallet_balance(p_seller_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_credits NUMERIC;
  v_total_debits NUMERIC;
  v_balance NUMERIC;
  v_pending_orders NUMERIC;
BEGIN
  -- Must be the seller or an admin
  IF auth.uid() != p_seller_id AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Sum all credits
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_credits
  FROM seller_wallet_transactions
  WHERE seller_id = p_seller_id AND type = 'credit';

  -- Sum all debits (refunds + withdrawals)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_debits
  FROM seller_wallet_transactions
  WHERE seller_id = p_seller_id AND type = 'debit';

  v_balance := v_total_credits - v_total_debits;

  -- Pending earnings: orders that are processing (not yet delivered)
  SELECT COALESCE(SUM(
    ROUND(oi.price * oi.quantity * 0.91, 2)
  ), 0)
  INTO v_pending_orders
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.seller_id = p_seller_id
    AND o.status NOT IN ('delivered', 'cancelled', 'returned', 'refunded')
    AND o.status != 'new';

  RETURN jsonb_build_object(
    'available_balance', GREATEST(v_balance, 0),
    'total_credits', v_total_credits,
    'total_debits', v_total_debits,
    'ledger_balance', v_balance,
    'pending_orders', v_pending_orders,
    'total_earnings', v_total_credits
  );
END;
$$;


-- ============================================================
-- PHASE 7 + 9: SETTLEMENT TABLE + PREVENT DOUBLE PAYOUT
-- ============================================================
-- seller_settlements already exists from prior migration.
-- Add unique index to prevent double settlement per seller+cycle.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE indexname = 'prevent_double_settlement'
  ) THEN
    CREATE UNIQUE INDEX prevent_double_settlement
      ON seller_settlements(seller_id, cycle)
      WHERE status != 'failed';
  END IF;
END$$;


-- ============================================================
-- PHASE 8: SETTLEMENT BATCH PROCESSING
-- Run on 1st and 16th of each month
-- ============================================================
CREATE OR REPLACE FUNCTION process_settlement_batch(p_cycle TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle TEXT;
  v_cycle_label TEXT;
  v_settled_count INT := 0;
  v_seller_count INT := 0;
  v_now TIMESTAMP := now();
  v_month_name TEXT;
  v_year INT;
  v_last_day INT;
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- Determine cycle
  IF p_cycle IS NOT NULL THEN
    v_cycle := p_cycle;
  ELSIF EXTRACT(DAY FROM v_now) <= 15 THEN
    -- Running on 1st–15th: settle previous CYCLE_2
    v_cycle := 'CYCLE_2';
  ELSE
    -- Running on 16th+: settle CYCLE_1
    v_cycle := 'CYCLE_1';
  END IF;

  -- Build cycle label
  v_month_name := to_char(v_now, 'Mon');
  v_year := EXTRACT(YEAR FROM v_now);
  v_last_day := EXTRACT(DAY FROM (date_trunc('month', v_now) + INTERVAL '1 month - 1 day'));
  IF v_cycle = 'CYCLE_1' THEN
    v_cycle_label := '1 ' || v_month_name || ' – 15 ' || v_month_name || ' ' || v_year;
  ELSE
    v_cycle_label := '16 ' || v_month_name || ' – ' || v_last_day || ' ' || v_month_name || ' ' || v_year;
  END IF;

  -- Insert settlement records per seller (skip if already settled)
  INSERT INTO seller_settlements (seller_id, cycle, cycle_label, total_amount, total_orders, status)
  SELECT
    oi.seller_id,
    v_cycle,
    v_cycle_label,
    SUM(ROUND(oi.price * oi.quantity * 0.91, 2)),
    COUNT(DISTINCT o.id),
    'pending'
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status = 'delivered'
    AND o.settlement_status = 'pending'
    AND o.settlement_cycle = v_cycle
    AND oi.seller_id IS NOT NULL
  GROUP BY oi.seller_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_seller_count = ROW_COUNT;

  -- Mark orders as settled
  UPDATE orders
  SET settlement_status = 'completed',
      updated_at = now()
  WHERE settlement_cycle = v_cycle
    AND status = 'delivered'
    AND settlement_status = 'pending';

  GET DIAGNOSTICS v_settled_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'cycle', v_cycle,
    'cycle_label', v_cycle_label,
    'sellers_settled', v_seller_count,
    'orders_settled', v_settled_count
  );
END;
$$;


-- ============================================================
-- PHASE 10: SECURE WITHDRAWAL (validates balance)
-- ============================================================
CREATE OR REPLACE FUNCTION request_withdrawal_secure(
  p_seller_id UUID,
  p_amount NUMERIC,
  p_currency TEXT DEFAULT 'INR',
  p_bank_details JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_withdrawal_id UUID;
BEGIN
  -- Auth check
  IF auth.uid() != p_seller_id THEN
    RAISE EXCEPTION 'Unauthorized: seller mismatch';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Withdrawal amount must be positive';
  END IF;

  -- Calculate current balance from ledger
  SELECT COALESCE(SUM(
    CASE WHEN type = 'credit' THEN amount ELSE -amount END
  ), 0)
  INTO v_balance
  FROM seller_wallet_transactions
  WHERE seller_id = p_seller_id;

  IF p_amount > v_balance THEN
    RAISE EXCEPTION 'INSUFFICIENT BALANCE: requested %, available %', p_amount, v_balance;
  END IF;

  -- Insert withdrawal record
  INSERT INTO withdrawals (seller_id, amount, currency, bank_details, status)
  VALUES (p_seller_id, p_amount, p_currency, p_bank_details, 'pending')
  RETURNING id INTO v_withdrawal_id;

  -- Debit the wallet ledger
  INSERT INTO seller_wallet_transactions (seller_id, type, source, amount)
  VALUES (p_seller_id, 'debit', 'withdrawal', p_amount);

  RETURN jsonb_build_object(
    'withdrawal_id', v_withdrawal_id,
    'amount', p_amount,
    'new_balance', v_balance - p_amount,
    'status', 'pending'
  );
END;
$$;


-- ============================================================
-- BACKFILL: Credit delivered orders into ledger
-- (idempotent — skips orders already credited)
-- ============================================================
INSERT INTO seller_wallet_transactions (seller_id, order_id, type, source, amount)
SELECT
  oi.seller_id,
  o.id,
  'credit',
  'order',
  ROUND(SUM(oi.price * oi.quantity) * 0.91, 2)
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status = 'delivered'
  AND oi.seller_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM seller_wallet_transactions wt
    WHERE wt.order_id = o.id
      AND wt.seller_id = oi.seller_id
      AND wt.type = 'credit'
      AND wt.source = 'order'
  )
GROUP BY oi.seller_id, o.id;

-- Backfill debits for refunded/returned/cancelled delivered orders
INSERT INTO seller_wallet_transactions (seller_id, order_id, type, source, amount)
SELECT
  wt.seller_id,
  wt.order_id,
  'debit',
  'refund',
  wt.amount
FROM seller_wallet_transactions wt
JOIN orders o ON o.id = wt.order_id
WHERE wt.type = 'credit'
  AND wt.source = 'order'
  AND o.status IN ('cancelled', 'returned', 'refunded')
  AND NOT EXISTS (
    SELECT 1 FROM seller_wallet_transactions wt2
    WHERE wt2.order_id = wt.order_id
      AND wt2.seller_id = wt.seller_id
      AND wt2.type = 'debit'
      AND wt2.source = 'refund'
  );


-- ============================================================
-- ADMIN: Allow admin to process settlements and view all data
-- ============================================================
-- Grant execute to authenticated users (auth check is inside function)
GRANT EXECUTE ON FUNCTION create_order_secure TO authenticated;
GRANT EXECUTE ON FUNCTION get_seller_wallet_balance TO authenticated;
GRANT EXECUTE ON FUNCTION process_settlement_batch TO authenticated;
GRANT EXECUTE ON FUNCTION request_withdrawal_secure TO authenticated;
