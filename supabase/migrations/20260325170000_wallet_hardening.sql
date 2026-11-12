-- ============================================================
-- WALLET HARDENING MIGRATION
-- Fixes: race conditions, settlement locking, per-item earnings,
--        settlement column mismatch, period-scoped cycles, REVOKE
-- ============================================================

-- ============================================================
-- 1. Add seller_earning per order_item (locks earning at creation time)
--    Eliminates recalculation in triggers / settlement batch
-- ============================================================
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_earning NUMERIC(12,2);

-- Backfill existing order_items where seller exists
UPDATE order_items
SET seller_earning = ROUND(price * quantity * 0.91, 2)
WHERE seller_earning IS NULL
  AND seller_id IS NOT NULL
  AND price > 0;

-- ============================================================
-- 2. Add settlement_period to seller_settlements
--    Enables per-month settlement (prevents blocking future cycles)
-- ============================================================
ALTER TABLE seller_settlements ADD COLUMN IF NOT EXISTS settlement_period TEXT;

-- Backfill existing settlement records (if any)
UPDATE seller_settlements
SET settlement_period = to_char(created_at, 'YYYY_MM')
WHERE settlement_period IS NULL;

-- Replace unique index to include period
DROP INDEX IF EXISTS prevent_double_settlement;
CREATE UNIQUE INDEX prevent_double_settlement
  ON seller_settlements(seller_id, cycle, settlement_period)
  WHERE status != 'failed';

-- ============================================================
-- 3. REVOKE direct writes on seller_wallet_transactions
--    Belt-and-suspenders: RLS already blocks, REVOKE adds defense-in-depth
-- ============================================================
REVOKE INSERT ON seller_wallet_transactions FROM authenticated;
REVOKE UPDATE ON seller_wallet_transactions FROM authenticated;
REVOKE DELETE ON seller_wallet_transactions FROM authenticated;
REVOKE INSERT ON seller_wallet_transactions FROM anon;
REVOKE UPDATE ON seller_wallet_transactions FROM anon;
REVOKE DELETE ON seller_wallet_transactions FROM anon;

-- ============================================================
-- 4. create_order_secure — now stores per-item seller_earning
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
  v_product_subtotal NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
  v_seller_earning NUMERIC := 0;
  v_total_amount NUMERIC := 0;
  v_settlement_cycle TEXT;
  v_order_id UUID;
  v_order_number TEXT;
  v_seller_id UUID;
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

  -- Insert order_items with real prices, seller_ids, and per-item seller_earning
  INSERT INTO order_items (
    order_id, product_id, product_name, product_image,
    quantity, price, seller_id, variant_info, seller_earning
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
    ),
    ROUND(p.price * (item->>'quantity')::INT * 0.91, 2)
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
-- 5. credit_seller_on_delivery — uses order_items.seller_earning
--    Handles multi-seller orders: one ledger entry per seller per order
--    Idempotent: NOT EXISTS prevents double credit
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

    -- Credit each seller for their portion using stored seller_earning
    -- COALESCE handles old items without seller_earning column populated
    INSERT INTO seller_wallet_transactions (seller_id, order_id, type, source, amount)
    SELECT
      oi.seller_id,
      NEW.id,
      'credit',
      'order',
      SUM(COALESCE(oi.seller_earning, ROUND(oi.price * oi.quantity * 0.91, 2)))
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
    GROUP BY oi.seller_id
    HAVING SUM(COALESCE(oi.seller_earning, ROUND(oi.price * oi.quantity * 0.91, 2))) > 0;

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
-- 6. debit_on_refund — only if credit exists, exact amount match
--    Idempotent: NOT EXISTS prevents double debit
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

    -- Debit each seller who was previously credited for this order
    -- Uses the EXACT credited amount (no recalculation)
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
-- 7. request_withdrawal_secure — RACE CONDITION FIX
--    Advisory lock serializes per-seller concurrent requests
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

  -- *** RACE CONDITION FIX ***
  -- Acquire transaction-scoped advisory lock per seller
  -- Serializes ALL concurrent withdrawal attempts for the same seller
  -- Second request blocks until first commits/rolls back
  PERFORM pg_advisory_xact_lock(hashtext('seller_withdrawal_' || p_seller_id::TEXT));

  -- Calculate current balance from ledger (safe under advisory lock)
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
-- 8. get_seller_wallet_balance — uses order_items.seller_earning
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

  -- Sum all credits from ledger
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_credits
  FROM seller_wallet_transactions
  WHERE seller_id = p_seller_id AND type = 'credit';

  -- Sum all debits from ledger (refunds + withdrawals)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_debits
  FROM seller_wallet_transactions
  WHERE seller_id = p_seller_id AND type = 'debit';

  v_balance := v_total_credits - v_total_debits;

  -- Pending: orders not yet delivered, using stored seller_earning
  SELECT COALESCE(SUM(
    COALESCE(oi.seller_earning, ROUND(oi.price * oi.quantity * 0.91, 2))
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
-- 9. process_settlement_batch — LOCKING + CORRECT COLUMNS + PERIOD
-- ============================================================
CREATE OR REPLACE FUNCTION process_settlement_batch(p_cycle TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_cycle TEXT;
  v_period TEXT;
  v_cycle_label TEXT;
  v_settled_count INT := 0;
  v_seller_count INT := 0;
  v_now TIMESTAMP := now();
  v_ref_date DATE;
  v_month_name TEXT;
  v_year INT;
  v_last_day INT;
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- Determine base cycle and period
  IF p_cycle IS NOT NULL THEN
    -- Accept full format: 'CYCLE_1_2026_03'
    IF p_cycle ~ '^CYCLE_[12]_\d{4}_\d{2}$' THEN
      v_base_cycle := LEFT(p_cycle, 7);
      v_period := SUBSTRING(p_cycle FROM 9);
    -- Accept simple format: 'CYCLE_1' or 'CYCLE_2' (auto-determine period)
    ELSIF p_cycle IN ('CYCLE_1', 'CYCLE_2') THEN
      v_base_cycle := p_cycle;
      v_period := to_char(v_now, 'YYYY_MM');
    ELSE
      RAISE EXCEPTION 'Invalid cycle: %. Use CYCLE_1, CYCLE_2, or CYCLE_1_YYYY_MM', p_cycle;
    END IF;
  ELSIF EXTRACT(DAY FROM v_now) <= 15 THEN
    -- Running 1st–15th: settle previous month's CYCLE_2
    v_base_cycle := 'CYCLE_2';
    v_period := to_char(v_now - INTERVAL '1 month', 'YYYY_MM');
  ELSE
    -- Running 16th+: settle current month's CYCLE_1
    v_base_cycle := 'CYCLE_1';
    v_period := to_char(v_now, 'YYYY_MM');
  END IF;

  -- *** SETTLEMENT LOCKING ***
  -- Advisory lock prevents concurrent settlement batch runs for same cycle+period
  PERFORM pg_advisory_xact_lock(
    hashtext('settlement_batch'),
    hashtext(v_base_cycle || '_' || v_period)
  );

  -- Derive reference date for label generation
  v_ref_date := to_date(v_period, 'YYYY_MM');
  IF v_base_cycle = 'CYCLE_2' THEN
    v_ref_date := v_ref_date + 15;
  END IF;

  -- Build human-readable cycle label
  v_month_name := to_char(v_ref_date, 'Mon');
  v_year := EXTRACT(YEAR FROM v_ref_date);
  v_last_day := EXTRACT(DAY FROM (date_trunc('month', v_ref_date) + INTERVAL '1 month - 1 day'));
  IF v_base_cycle = 'CYCLE_1' THEN
    v_cycle_label := '1 ' || v_month_name || ' – 15 ' || v_month_name || ' ' || v_year;
  ELSE
    v_cycle_label := '16 ' || v_month_name || ' – ' || v_last_day || ' ' || v_month_name || ' ' || v_year;
  END IF;

  -- Insert settlement records per seller using CORRECT column names
  -- Uses order_items.seller_earning (pre-computed) with COALESCE fallback
  INSERT INTO seller_settlements (
    seller_id, cycle, settlement_period, cycle_label,
    total_product_subtotal, total_platform_fee, total_seller_earning,
    total_orders, status
  )
  SELECT
    oi.seller_id,
    v_base_cycle,
    v_period,
    v_cycle_label,
    SUM(oi.price * oi.quantity),
    SUM(oi.price * oi.quantity) - SUM(COALESCE(oi.seller_earning, ROUND(oi.price * oi.quantity * 0.91, 2))),
    SUM(COALESCE(oi.seller_earning, ROUND(oi.price * oi.quantity * 0.91, 2))),
    COUNT(DISTINCT o.id),
    'pending'
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.status = 'delivered'
    AND o.settlement_status = 'pending'
    AND o.settlement_cycle = v_base_cycle
    AND oi.seller_id IS NOT NULL
  GROUP BY oi.seller_id
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_seller_count = ROW_COUNT;

  -- Mark settled orders — lock rows first to prevent concurrent processing
  WITH locked_orders AS (
    SELECT id FROM orders
    WHERE settlement_cycle = v_base_cycle
      AND status = 'delivered'
      AND settlement_status = 'pending'
    FOR UPDATE
  )
  UPDATE orders
  SET settlement_status = 'completed',
      updated_at = now()
  WHERE id IN (SELECT id FROM locked_orders);

  GET DIAGNOSTICS v_settled_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'cycle', v_base_cycle,
    'period', v_period,
    'cycle_label', v_cycle_label,
    'sellers_settled', v_seller_count,
    'orders_settled', v_settled_count
  );
END;
$$;


-- ============================================================
-- Maintain existing grants
-- ============================================================
GRANT EXECUTE ON FUNCTION create_order_secure TO authenticated;
GRANT EXECUTE ON FUNCTION get_seller_wallet_balance TO authenticated;
GRANT EXECUTE ON FUNCTION process_settlement_batch TO authenticated;
GRANT EXECUTE ON FUNCTION request_withdrawal_secure TO authenticated;
