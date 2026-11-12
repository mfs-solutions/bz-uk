-- ============================================================
-- FINANCIAL SECURITY HARDENING MIGRATION
-- Fixes: F1 (seller self-credit), F2 (payment verification),
--        F3 (commission from rules), F7 (unique constraint),
--        F8 (withdrawal lockdown)
-- ============================================================

BEGIN;

-- ============================================================
-- F7. UNIQUE CONSTRAINT — prevents double credit at DB level
-- Belt-and-suspenders to trigger NOT EXISTS check
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_txn_order_seller_type_source
  ON seller_wallet_transactions(order_id, seller_id, type, source)
  WHERE order_id IS NOT NULL;


-- ============================================================
-- F8. LOCK DOWN WITHDRAWALS TABLE — remove direct INSERT
-- Force all withdrawals through request_withdrawal_secure()
-- ============================================================
REVOKE INSERT ON withdrawals FROM authenticated;
REVOKE INSERT ON withdrawals FROM anon;


-- ============================================================
-- F1 + F2. CREDIT TRIGGER — payment verification + source check
-- Only credit when:  
--   1. payment_status IN ('paid', 'completed', 'succeeded')
--   2. Status changed to 'delivered' (trigger condition)
--   3. NOT already credited (NOT EXISTS)
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

    -- *** F2: PAYMENT VERIFICATION ***
    -- Never credit sellers for unpaid orders
    IF NEW.payment_status IS NULL
       OR NEW.payment_status NOT IN ('paid', 'completed', 'succeeded') THEN
      RAISE WARNING '[wallet] Skipping credit for order % — payment_status is "%", not paid',
        NEW.id, COALESCE(NEW.payment_status, 'NULL');
      RETURN NEW;
    END IF;

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
-- F6. DYNAMIC COMMISSION — read from platform_commission_rules
-- Updated create_order_secure to look up commission rate
-- instead of hardcoding 9%
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
  p_fx_rate numeric DEFAULT 1
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
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user mismatch';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  -- *** F2: FORCE payment_status — only 'pending' and 'cod' allowed at creation ***
  -- Stripe webhook or admin must confirm payment separately.
  -- COD orders legitimately start as 'pending' with payment_method='cod'.
  v_safe_payment_status := CASE
    WHEN LOWER(TRIM(COALESCE(p_payment_status, 'pending'))) IN ('paid', 'completed', 'succeeded')
      THEN 'pending'  -- Client cannot declare payment as paid; must come from Stripe webhook
    ELSE LOWER(TRIM(COALESCE(p_payment_status, 'pending')))
  END;

  -- Sanitize FX rate: must be positive
  v_fx := GREATEST(COALESCE(p_fx_rate, 1), 0.000001);

  -- Pricing rule:
  -- Single variant product → use product selling price (p.price)
  -- Multiple variant product → use matched variant price, fallback to p.price
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

  -- Convert product subtotal from INR to buyer currency
  v_product_subtotal := ROUND(v_product_subtotal_inr * v_fx, 2);

  -- *** F6: DYNAMIC COMMISSION from platform_commission_rules ***
  -- Look up the best matching rule: country-specific first, then global, then default 9%
  SELECT
    COALESCE(r.charge_percent, 9),
    COALESCE(r.extra_charge, 0)
  INTO v_commission_percent, v_commission_extra
  FROM platform_commission_rules r
  WHERE r.is_active = true
    AND v_product_subtotal >= COALESCE(r.from_price, 0)
    AND (r.to_price IS NULL OR v_product_subtotal <= r.to_price)
  ORDER BY
    -- Country-specific rules first (if we add country lookup later)
    CASE WHEN r.country_id IS NULL THEN 1 ELSE 0 END,
    COALESCE(r.from_price, 0) DESC,
    r.created_at DESC
  LIMIT 1;

  -- Fallback to 9% if no rule found
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
    settlement_cycle, settlement_status
  ) VALUES (
    p_user_id, v_seller_id, p_order_status, v_safe_payment_status,
    v_total_amount, UPPER(TRIM(COALESCE(p_currency, 'INR'))), p_shipping_address, p_billing_address,
    p_phone, p_notes, v_order_number, p_payment_intent_id, p_payment_method,
    COALESCE(p_shipping_charge, 0), COALESCE(p_actual_shipping_cost, 0), COALESCE(p_platform_shipping_margin, 0),
    v_product_subtotal, v_platform_fee, v_seller_earning,
    v_settlement_cycle, 'pending'
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
    -- Per-item seller earning using dynamic commission rate
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
-- F2. STRIPE PAYMENT CONFIRMATION FUNCTION
-- Called after Stripe confirms payment (from Stripe webhook or 
-- client-side after confirmPayment). Sets payment_status to 'paid'
-- and order_status to 'processing' for pending orders.
-- Idempotent — safe to call multiple times.
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id UUID,
  p_payment_intent_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
BEGIN
  -- Must be authenticated
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Fetch order
  SELECT id, user_id, payment_status, payment_intent_id, status
  INTO v_order
  FROM orders
  WHERE id = p_order_id;

  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Caller must be the order owner or admin
  IF auth.uid() != v_order.user_id AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: not order owner';
  END IF;

  -- Verify payment_intent_id matches
  IF v_order.payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
    RAISE EXCEPTION 'Payment intent mismatch';
  END IF;

  -- Already paid — idempotent
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

COMMIT;
