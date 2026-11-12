-- ============================================================
-- PRODUCTION HARDENING MIGRATION — FINTECH-GRADE
-- Phase 1: Idempotency, constraints, audit, replay protection,
--          partial refund, DB lockdown, reconciliation
-- ============================================================

BEGIN;

-- ============================================================
-- 1. STRIPE WEBHOOK EVENTS TABLE — audit + dead-letter + dedup
-- ============================================================
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payment_intent_id TEXT,
  status TEXT NOT NULL DEFAULT 'processed'
    CHECK (status IN ('processed', 'failed', 'skipped')),
  error_message TEXT,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique on stripe_event_id + status=processed for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_event_processed
  ON stripe_webhook_events(stripe_event_id)
  WHERE status = 'processed';

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_pi
  ON stripe_webhook_events(payment_intent_id);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_status
  ON stripe_webhook_events(status) WHERE status = 'failed';

-- RLS: admin-only read
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins read stripe events" ON stripe_webhook_events;
CREATE POLICY "Only admins read stripe events"
  ON stripe_webhook_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Block client writes stripe events" ON stripe_webhook_events;
CREATE POLICY "Block client writes stripe events"
  ON stripe_webhook_events FOR INSERT
  WITH CHECK (false);

-- Only service role can write
REVOKE INSERT ON stripe_webhook_events FROM authenticated;
REVOKE INSERT ON stripe_webhook_events FROM anon;
REVOKE UPDATE ON stripe_webhook_events FROM authenticated;
REVOKE UPDATE ON stripe_webhook_events FROM anon;
REVOKE DELETE ON stripe_webhook_events FROM authenticated;
REVOKE DELETE ON stripe_webhook_events FROM anon;


-- ============================================================
-- 2. ORDER IDEMPOTENCY KEY — prevents duplicate orders on retry
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_order_idempotency
  ON orders(idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- ============================================================
-- 3. WALLET TRANSACTION AMOUNT CHECK — no zero/negative values
--    (already has CHECK(amount > 0) from initial migration,
--     but add if missing)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name LIKE '%wallet%amount%'
      OR constraint_name LIKE '%seller_wallet%amount%'
  ) THEN
    ALTER TABLE seller_wallet_transactions
      ADD CONSTRAINT chk_wallet_amount_positive CHECK (amount > 0);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- constraint already exists
END;
$$;


-- ============================================================
-- 4. FINANCIAL AUDIT LOG — immutable ledger of all financial ops
-- ============================================================
CREATE TABLE IF NOT EXISTS financial_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'order_created', 'payment_confirmed', 'payment_failed',
      'seller_credited', 'seller_debited',
      'withdrawal_requested', 'withdrawal_approved', 'withdrawal_rejected',
      'refund_initiated', 'partial_refund', 'settlement_completed',
      'manual_adjustment'
    )),
  order_id UUID REFERENCES orders(id),
  seller_id UUID,
  user_id UUID,
  amount NUMERIC(12,2),
  currency TEXT DEFAULT 'INR',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Immutable: no updates/deletes
  immutable_hash TEXT GENERATED ALWAYS AS (
    md5(
      COALESCE(event_type, '') || '|' ||
      COALESCE(order_id::TEXT, '') || '|' ||
      COALESCE(seller_id::TEXT, '') || '|' ||
      COALESCE(amount::TEXT, '0') || '|' ||
      COALESCE(currency, 'INR')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_audit_order ON financial_audit_log(order_id);
CREATE INDEX IF NOT EXISTS idx_audit_seller ON financial_audit_log(seller_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON financial_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_created ON financial_audit_log(created_at DESC);

-- RLS: admin read-only
ALTER TABLE financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON financial_audit_log;
CREATE POLICY "Admins read audit log"
  ON financial_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Block ALL client operations
REVOKE ALL ON financial_audit_log FROM authenticated;
REVOKE ALL ON financial_audit_log FROM anon;
GRANT SELECT ON financial_audit_log TO authenticated; -- admin RLS will filter


-- ============================================================
-- 5. AUDIT TRIGGER on wallet transactions — auto-log credits/debits
-- ============================================================
CREATE OR REPLACE FUNCTION log_wallet_transaction_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO financial_audit_log (event_type, order_id, seller_id, amount, currency, metadata)
  VALUES (
    CASE WHEN NEW.type = 'credit' THEN 'seller_credited' ELSE 'seller_debited' END,
    NEW.order_id,
    NEW.seller_id,
    NEW.amount,
    'INR',
    jsonb_build_object('source', NEW.source, 'wallet_txn_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_wallet_transaction ON seller_wallet_transactions;
CREATE TRIGGER audit_wallet_transaction
  AFTER INSERT ON seller_wallet_transactions
  FOR EACH ROW
  EXECUTE FUNCTION log_wallet_transaction_audit();


-- ============================================================
-- 6. AUDIT TRIGGER on orders — log creation and payment changes
-- ============================================================
CREATE OR REPLACE FUNCTION log_order_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO financial_audit_log (event_type, order_id, user_id, amount, currency, metadata)
    VALUES (
      'order_created',
      NEW.id,
      NEW.user_id,
      NEW.total_amount,
      NEW.currency,
      jsonb_build_object(
        'order_number', NEW.order_number,
        'payment_method', NEW.payment_method,
        'payment_status', NEW.payment_status
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log payment confirmation
    IF OLD.payment_status IS DISTINCT FROM NEW.payment_status
       AND NEW.payment_status IN ('paid', 'completed', 'succeeded') THEN
      INSERT INTO financial_audit_log (event_type, order_id, user_id, amount, currency, metadata)
      VALUES (
        'payment_confirmed',
        NEW.id,
        NEW.user_id,
        NEW.total_amount,
        NEW.currency,
        jsonb_build_object(
          'old_status', OLD.payment_status,
          'new_status', NEW.payment_status,
          'payment_intent_id', NEW.payment_intent_id
        )
      );
    END IF;

    -- Log payment failure
    IF OLD.payment_status IS DISTINCT FROM NEW.payment_status
       AND NEW.payment_status = 'failed' THEN
      INSERT INTO financial_audit_log (event_type, order_id, user_id, amount, currency, metadata)
      VALUES (
        'payment_failed',
        NEW.id,
        NEW.user_id,
        NEW.total_amount,
        NEW.currency,
        jsonb_build_object('old_status', OLD.payment_status)
      );
    END IF;

    -- Log refund/return
    IF OLD.status IS DISTINCT FROM NEW.status
       AND NEW.status IN ('refunded', 'returned', 'cancelled') THEN
      INSERT INTO financial_audit_log (event_type, order_id, user_id, amount, currency, metadata)
      VALUES (
        'refund_initiated',
        NEW.id,
        NEW.user_id,
        NEW.total_amount,
        NEW.currency,
        jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_order_changes ON orders;
CREATE TRIGGER audit_order_changes
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION log_order_audit();


-- ============================================================
-- 7. WEBHOOK REPLAY PROTECTION — event_hash for Delhivery
-- ============================================================
ALTER TABLE delhivery_webhook_events
  ADD COLUMN IF NOT EXISTS event_hash TEXT,
  ADD COLUMN IF NOT EXISTS retry_pending BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delhivery_event_hash
  ON delhivery_webhook_events(event_hash)
  WHERE event_hash IS NOT NULL;


-- ============================================================
-- 8. UPDATE create_order_secure WITH IDEMPOTENCY KEY
-- ============================================================
DROP FUNCTION IF EXISTS public.create_order_secure(uuid, jsonb, jsonb, jsonb, text, text, text, text, text, text, text, numeric, numeric, numeric, numeric);

-- ─────────────────────────────────────────────────────────────────────────────
-- SUPERSEDED — DO NOT RE-RUN THIS DEFINITION ON ITS OWN.
-- Canonical create_order_secure = 20260527120000_restore_server_fx_create_order_secure.sql
-- This older body does NOT derive FX correctly from countries.exchange_rate
-- (it predates server-side FX or defaults v_fx to 1), so applying it in isolation
-- silently mislabels foreign-currency order totals (the ORD-1779833529 FX bug).
-- In-order migration replay is safe; only a manual re-run of THIS file is dangerous.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_order_secure(
  p_user_id uuid,
  p_items jsonb,
  p_shipping_address jsonb DEFAULT NULL,
  p_billing_address jsonb DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_intent_id text DEFAULT NULL,
  p_payment_method text DEFAULT 'card',
  p_payment_status text DEFAULT 'pending',
  p_order_status text DEFAULT 'pending',
  p_currency text DEFAULT 'INR',
  p_shipping_charge numeric DEFAULT 0,
  p_actual_shipping_cost numeric DEFAULT 0,
  p_platform_shipping_margin numeric DEFAULT 0,
  p_fx_rate numeric DEFAULT 1,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_subtotal_inr NUMERIC := 0;
  v_product_subtotal NUMERIC := 0;
  v_platform_fee NUMERIC := 0;
  v_seller_earning NUMERIC := 0;
  v_total_amount NUMERIC := 0;
  v_platform_handling_charge NUMERIC := 0;
  v_settlement_cycle TEXT;
  v_order_id UUID;
  v_order_number TEXT;
  v_seller_id UUID;
  v_distinct_sellers UUID[];
  v_fx NUMERIC;
  v_commission_percent NUMERIC;
  v_commission_extra NUMERIC;
  v_safe_payment_status TEXT;
  v_existing_order RECORD;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user mismatch';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  -- *** IDEMPOTENCY: Return existing order if key matches ***
  IF p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != '' THEN
    SELECT id, order_number, total_amount, product_subtotal, platform_fee,
           seller_earning, settlement_cycle, settlement_status, status,
           payment_status, currency, created_at
    INTO v_existing_order
    FROM orders
    WHERE idempotency_key = TRIM(p_idempotency_key)
      AND user_id = p_user_id;

    IF v_existing_order IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id', v_existing_order.id,
        'order_number', v_existing_order.order_number,
        'total_amount', v_existing_order.total_amount,
        'product_subtotal', v_existing_order.product_subtotal,
        'platform_fee', v_existing_order.platform_fee,
        'seller_earning', v_existing_order.seller_earning,
        'settlement_cycle', v_existing_order.settlement_cycle,
        'settlement_status', v_existing_order.settlement_status,
        'status', v_existing_order.status,
        'payment_status', v_existing_order.payment_status,
        'currency', v_existing_order.currency,
        'created_at', v_existing_order.created_at,
        'idempotent', true
      );
    END IF;
  END IF;

  -- FORCE payment_status — only 'pending' allowed at creation
  v_safe_payment_status := CASE
    WHEN LOWER(TRIM(COALESCE(p_payment_status, 'pending'))) IN ('paid', 'completed', 'succeeded')
      THEN 'pending'
    ELSE LOWER(TRIM(COALESCE(p_payment_status, 'pending')))
  END;

  -- Sanitize FX rate
  v_fx := GREATEST(COALESCE(p_fx_rate, 1), 0.000001);

  -- Compute product subtotal from DB prices
  SELECT COALESCE(SUM(
    CASE
      WHEN (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) > 1
        THEN COALESCE(pv.price, p.price)
      ELSE p.price
    END * (item->>'quantity')::INT
  ), 0)
  INTO v_product_subtotal_inr
  FROM jsonb_array_elements(p_items) item
  JOIN products p ON p.id = (item->>'product_id')::UUID
  LEFT JOIN product_variants pv
    ON pv.product_id = p.id
    AND pv.sku = UPPER(TRIM(COALESCE(item->'variant_info'->>'sku', '')))
    AND UPPER(TRIM(COALESCE(item->'variant_info'->>'sku', ''))) <> '';

  IF v_product_subtotal_inr <= 0 THEN
    RAISE EXCEPTION 'Invalid product subtotal: no valid products found';
  END IF;

  v_product_subtotal := ROUND(v_product_subtotal_inr * v_fx, 2);

  -- Dynamic commission from platform_commission_rules
  SELECT
    COALESCE(r.charge_percent, 9),
    COALESCE(r.extra_charge, 0)
  INTO v_commission_percent, v_commission_extra
  FROM platform_commission_rules r
  WHERE r.is_active = true
    AND v_product_subtotal >= COALESCE(r.from_price, 0)
    AND (r.to_price IS NULL OR v_product_subtotal <= r.to_price)
  ORDER BY
    CASE WHEN r.country_id IS NULL THEN 1 ELSE 0 END,
    COALESCE(r.from_price, 0) DESC,
    r.created_at DESC
  LIMIT 1;

  IF v_commission_percent IS NULL THEN
    v_commission_percent := 9;
    v_commission_extra := 0;
  END IF;

  v_platform_fee := ROUND(v_product_subtotal * v_commission_percent / 100, 2) + v_commission_extra;
  v_seller_earning := ROUND(v_product_subtotal - v_platform_fee, 2);

  v_platform_handling_charge := ROUND(
    (v_product_subtotal + COALESCE(p_shipping_charge, 0)) * 0.03, 2
  );
  v_total_amount := ROUND(
    v_product_subtotal + COALESCE(p_shipping_charge, 0) + v_platform_handling_charge, 2
  );

  IF EXTRACT(DAY FROM now()) <= 15 THEN
    v_settlement_cycle := 'CYCLE_1';
  ELSE
    v_settlement_cycle := 'CYCLE_2';
  END IF;

  v_order_number := 'ORD-' || EXTRACT(EPOCH FROM now())::BIGINT || '-' || LEFT(gen_random_uuid()::TEXT, 8);

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

  INSERT INTO orders (
    user_id, seller_id, status, payment_status,
    total_amount, currency, shipping_address, billing_address,
    phone, notes, order_number, payment_intent_id, payment_method,
    shipping_charge, actual_shipping_cost, platform_shipping_margin,
    product_subtotal, platform_fee, seller_earning,
    settlement_cycle, settlement_status, idempotency_key
  ) VALUES (
    p_user_id, v_seller_id, p_order_status, v_safe_payment_status,
    v_total_amount, UPPER(TRIM(COALESCE(p_currency, 'INR'))), p_shipping_address, p_billing_address,
    p_phone, p_notes, v_order_number, p_payment_intent_id, p_payment_method,
    COALESCE(p_shipping_charge, 0), COALESCE(p_actual_shipping_cost, 0), COALESCE(p_platform_shipping_margin, 0),
    v_product_subtotal, v_platform_fee, v_seller_earning,
    v_settlement_cycle, 'pending',
    CASE WHEN p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != ''
         THEN TRIM(p_idempotency_key) ELSE NULL END
  )
  RETURNING id INTO v_order_id;

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
    ROUND(
      CASE
        WHEN (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) > 1
          THEN COALESCE(pv.price, p.price)
        ELSE p.price
      END * v_fx, 2
    ),
    p.seller_id,
    jsonb_build_object(
      'size', item->'variant_info'->>'size',
      'color', item->'variant_info'->>'color',
      'sku', COALESCE(item->'variant_info'->>'sku', p.sku),
      'hsn_code', COALESCE(item->'variant_info'->>'hsn_code', p.hsn_code),
      'expected_delivery_days', NULL
    ),
    ROUND(
      CASE
        WHEN (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) > 1
          THEN COALESCE(pv.price, p.price)
        ELSE p.price
      END * v_fx * (item->>'quantity')::INT * (1 - v_commission_percent / 100), 2
    )
  FROM jsonb_array_elements(p_items) item
  JOIN products p ON p.id = (item->>'product_id')::UUID
  LEFT JOIN product_variants pv
    ON pv.product_id = p.id
    AND pv.sku = UPPER(TRIM(COALESCE(item->'variant_info'->>'sku', '')))
    AND UPPER(TRIM(COALESCE(item->'variant_info'->>'sku', ''))) <> '';

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
    'payment_status', v_safe_payment_status,
    'currency', UPPER(TRIM(COALESCE(p_currency, 'INR'))),
    'created_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_secure TO authenticated;


-- ============================================================
-- 9. CONFIRM ORDER PAYMENT (service-role variant for webhook)
-- Overwrite with version that also accepts service-role calls
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id UUID,
  p_payment_intent_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Auth: allow authenticated user (order owner / admin) or service role
  -- Service role bypasses auth.uid() check (comes from Stripe webhook)

  SELECT id, user_id, payment_status, payment_intent_id, status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- If called by authenticated user, verify ownership
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() != v_order.user_id AND NOT EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Unauthorized: not order owner';
    END IF;
  END IF;

  -- If payment_intent_id provided, verify match
  IF p_payment_intent_id IS NOT NULL
     AND v_order.payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
    RAISE EXCEPTION 'Payment intent mismatch';
  END IF;

  -- Idempotent: already paid
  IF v_order.payment_status IN ('paid', 'completed', 'succeeded') THEN
    RETURN jsonb_build_object('id', v_order.id, 'payment_status', v_order.payment_status, 'already_confirmed', true);
  END IF;

  -- Mark as paid
  UPDATE orders
  SET payment_status = 'paid',
      status = CASE WHEN status IN ('pending', 'new') THEN 'processing' ELSE status END,
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('id', v_order.id, 'payment_status', 'paid', 'already_confirmed', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_order_payment TO authenticated;


-- ============================================================
-- 10. PARTIAL REFUND SUPPORT — debit only specific items
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_partial_refund(
  p_order_id UUID,
  p_item_ids UUID[],  -- array of order_item IDs to refund
  p_reason TEXT DEFAULT 'partial_refund'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_total_refund NUMERIC := 0;
  v_items_refunded INT := 0;
  v_item RECORD;
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT id, status, payment_status INTO v_order
  FROM orders WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Process each item
  FOR v_item IN
    SELECT oi.id, oi.seller_id, oi.order_id,
           COALESCE(oi.seller_earning, ROUND(oi.price * oi.quantity * 0.91, 2)) AS credit_amount
    FROM order_items oi
    WHERE oi.id = ANY(p_item_ids)
      AND oi.order_id = p_order_id
      AND oi.seller_id IS NOT NULL
  LOOP
    -- Only debit if credit exists and not already debited for this item
    IF EXISTS (
      SELECT 1 FROM seller_wallet_transactions
      WHERE order_id = v_item.order_id
        AND seller_id = v_item.seller_id
        AND type = 'credit'
        AND source = 'order'
    ) AND NOT EXISTS (
      SELECT 1 FROM seller_wallet_transactions
      WHERE order_id = v_item.order_id
        AND seller_id = v_item.seller_id
        AND type = 'debit'
        AND source = 'refund'
        AND metadata->>'item_id' = v_item.id::TEXT
    ) THEN
      INSERT INTO seller_wallet_transactions (seller_id, order_id, type, source, amount, metadata)
      VALUES (
        v_item.seller_id,
        v_item.order_id,
        'debit',
        'refund',
        v_item.credit_amount,
        jsonb_build_object('item_id', v_item.id, 'reason', p_reason, 'partial', true)
      );
      v_total_refund := v_total_refund + v_item.credit_amount;
      v_items_refunded := v_items_refunded + 1;
    END IF;
  END LOOP;

  -- Log partial refund
  INSERT INTO financial_audit_log (event_type, order_id, amount, currency, metadata)
  VALUES (
    'partial_refund',
    p_order_id,
    v_total_refund,
    'INR',
    jsonb_build_object('items_refunded', v_items_refunded, 'item_ids', to_jsonb(p_item_ids), 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'order_id', p_order_id,
    'items_refunded', v_items_refunded,
    'total_refund', v_total_refund
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_partial_refund TO authenticated;


-- ============================================================
-- 11. ADD metadata COLUMN to wallet transactions for partial refund tracking
-- ============================================================
ALTER TABLE seller_wallet_transactions
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';


-- ============================================================
-- 12. SETTLEMENT RECONCILIATION — verify wallet credits exist
-- ============================================================
CREATE OR REPLACE FUNCTION public.verify_settlement_readiness(
  p_seller_id UUID,
  p_cycle TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders_without_credit INT;
  v_total_credited NUMERIC;
  v_total_debited NUMERIC;
  v_net_balance NUMERIC;
  v_uncredited_orders JSONB;
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- Find delivered orders for this seller/cycle that DON'T have wallet credits
  SELECT COUNT(*), COALESCE(jsonb_agg(o.id), '[]'::jsonb)
  INTO v_orders_without_credit, v_uncredited_orders
  FROM orders o
  WHERE o.seller_id = p_seller_id
    AND o.settlement_cycle = p_cycle
    AND o.status = 'delivered'
    AND o.payment_status IN ('paid', 'completed', 'succeeded')
    AND NOT EXISTS (
      SELECT 1 FROM seller_wallet_transactions wt
      WHERE wt.order_id = o.id
        AND wt.seller_id = p_seller_id
        AND wt.type = 'credit'
        AND wt.source = 'order'
    );

  -- Net balance from ledger
  SELECT
    COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
  INTO v_total_credited, v_total_debited
  FROM seller_wallet_transactions
  WHERE seller_id = p_seller_id;

  v_net_balance := v_total_credited - v_total_debited;

  RETURN jsonb_build_object(
    'seller_id', p_seller_id,
    'cycle', p_cycle,
    'orders_without_credit', v_orders_without_credit,
    'uncredited_order_ids', v_uncredited_orders,
    'total_credited', v_total_credited,
    'total_debited', v_total_debited,
    'net_balance', v_net_balance,
    'ready_for_settlement', v_orders_without_credit = 0
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_settlement_readiness TO authenticated;


-- ============================================================
-- 13. BULK RECONCILIATION: Sync Delhivery Active Shipments
-- Callable via delhivery-ops edge function
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_delhivery_shipments()
RETURNS TABLE(
  shipment_id UUID,
  order_id UUID,
  seller_id UUID,
  waybill TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  RETURN QUERY
  SELECT ds.id, ds.order_id, ds.seller_id, ds.waybill, ds.status, ds.created_at
  FROM delhivery_shipments ds
  WHERE ds.status NOT IN ('delivered', 'cancelled', 'rto', 'returned')
    AND ds.waybill IS NOT NULL
    AND ds.created_at > now() - INTERVAL '60 days'
  ORDER BY ds.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_delhivery_shipments TO authenticated;


-- ============================================================
-- 14. LOCK DOWN SENSITIVE TABLES — no direct client writes
-- ============================================================

-- order_items: only via create_order_secure
REVOKE INSERT ON order_items FROM authenticated;
REVOKE INSERT ON order_items FROM anon;
REVOKE UPDATE ON order_items FROM authenticated;
REVOKE UPDATE ON order_items FROM anon;
REVOKE DELETE ON order_items FROM authenticated;
REVOKE DELETE ON order_items FROM anon;

-- payment_intents: allow INSERT (client records after Stripe), block UPDATE/DELETE
REVOKE UPDATE ON payment_intents FROM authenticated;
REVOKE UPDATE ON payment_intents FROM anon;
REVOKE DELETE ON payment_intents FROM authenticated;
REVOKE DELETE ON payment_intents FROM anon;

-- orders: block direct INSERT (must use RPC), allow SELECT + limited UPDATE
-- Note: Cannot fully REVOKE INSERT as some admin flows may use it.
-- RLS handles access control. Block anon only.
REVOKE INSERT ON orders FROM anon;
REVOKE DELETE ON orders FROM authenticated;
REVOKE DELETE ON orders FROM anon;


-- ============================================================
-- 15. CURRENCY-SAFE ADMIN ACCOUNTING FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_account_summary_safe(
  p_currency TEXT DEFAULT 'INR'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_revenue NUMERIC;
  v_total_platform_fees NUMERIC;
  v_total_seller_earnings NUMERIC;
  v_total_payouts NUMERIC;
  v_total_wallet_credits NUMERIC;
  v_total_wallet_debits NUMERIC;
  v_order_count INT;
BEGIN
  -- Admin only
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  -- Revenue from paid orders in specified currency only
  SELECT
    COALESCE(SUM(o.product_subtotal), 0),
    COALESCE(SUM(o.platform_fee), 0),
    COALESCE(SUM(o.seller_earning), 0),
    COUNT(*)
  INTO v_total_revenue, v_total_platform_fees, v_total_seller_earnings, v_order_count
  FROM orders o
  WHERE o.payment_status IN ('paid', 'completed', 'succeeded')
    AND o.status NOT IN ('cancelled', 'refunded', 'returned')
    AND UPPER(TRIM(COALESCE(o.currency, 'INR'))) = UPPER(TRIM(p_currency));

  -- Wallet ledger totals (always INR)
  SELECT
    COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
  INTO v_total_wallet_credits, v_total_wallet_debits
  FROM seller_wallet_transactions;

  -- Payouts = debit withdrawals only
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_payouts
  FROM seller_wallet_transactions
  WHERE type = 'debit' AND source = 'withdrawal';

  RETURN jsonb_build_object(
    'currency', UPPER(TRIM(p_currency)),
    'order_count', v_order_count,
    'total_revenue', v_total_revenue,
    'platform_fees', v_total_platform_fees,
    'seller_earnings', v_total_seller_earnings,
    'total_payouts', v_total_payouts,
    'wallet_credits', v_total_wallet_credits,
    'wallet_debits', v_total_wallet_debits,
    'wallet_balance', v_total_wallet_credits - v_total_wallet_debits,
    'net_platform_profit', v_total_revenue - v_total_seller_earnings - v_total_payouts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_summary_safe TO authenticated;


COMMIT;
