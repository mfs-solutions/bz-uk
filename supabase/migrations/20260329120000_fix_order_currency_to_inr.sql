-- Fix: orders.currency was set to the buyer's display currency (e.g. 'GBP')
-- but total_amount / item prices are computed from products.price (always INR).
-- This caused invoices to mislabel INR amounts as GBP and admin to show
-- wrong totals (double-converting).
--
-- Fix: always store currency = 'INR' since all DB amounts are INR.
-- The buyer's actual payment currency lives in payment_intents.currency.
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
  v_platform_handling_charge NUMERIC := 0;
  v_settlement_cycle TEXT;
  v_order_id UUID;
  v_order_number TEXT;
  v_seller_id UUID;
  v_distinct_sellers UUID[];
BEGIN
  IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: user mismatch';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  -- product prices are always INR
  SELECT COALESCE(SUM(p.price * (item->>'quantity')::INT), 0)
  INTO v_product_subtotal
  FROM jsonb_array_elements(p_items) item
  JOIN products p ON p.id = (item->>'product_id')::UUID;

  IF v_product_subtotal <= 0 THEN
    RAISE EXCEPTION 'Invalid product subtotal: no valid products found';
  END IF;

  v_platform_fee := ROUND(v_product_subtotal * 0.09, 2);
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

  -- Always store currency as 'INR' — amounts are from INR product prices
  INSERT INTO orders (
    user_id, seller_id, status, payment_status,
    total_amount, currency, shipping_address, billing_address,
    phone, notes, order_number, payment_intent_id, payment_method,
    shipping_charge, actual_shipping_cost, platform_shipping_margin,
    product_subtotal, platform_fee, seller_earning,
    settlement_cycle, settlement_status
  ) VALUES (
    p_user_id, v_seller_id, p_order_status, p_payment_status,
    v_total_amount, 'INR', p_shipping_address, p_billing_address,
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
    'currency', 'INR',
    'created_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_secure TO authenticated;

-- Backfill: fix existing orders that have wrong currency labels
UPDATE orders
SET currency = 'INR'
WHERE currency IS DISTINCT FROM 'INR';
