-- =============================================================
-- Stock Decrement on Order + Restore on Cancel/Return
-- =============================================================
-- WHAT THIS DOES:
--   1. Adds stock decrement inside create_order_secure
--      - per-variant stock on product_variants (matched by sku)
--      - product-level stock on products (always kept in sync)
--   2. Adds a trigger on order_items to restore stock when an
--      item's parent order moves to cancelled / returned / refunded
-- =============================================================

-- ── 1. Replace create_order_secure with stock-decrementing version ──
DROP FUNCTION IF EXISTS public.create_order_secure(
  uuid, jsonb, jsonb, jsonb, text, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text, text, text, text, text,
  timestamptz, integer
);

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
  p_idempotency_key text DEFAULT NULL,
  p_shipping_carrier text DEFAULT NULL,
  p_shipping_service_level text DEFAULT NULL,
  p_shipping_provider text DEFAULT NULL,
  p_shipping_rate_id text DEFAULT NULL,
  p_expected_delivery_date timestamptz DEFAULT NULL,
  p_expected_delivery_days integer DEFAULT NULL
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
  v_item JSONB;
  v_qty INT;
  v_sku TEXT;
  v_product_id UUID;
  v_has_variants BOOLEAN;
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

  -- ── STOCK CHECK: ensure enough stock exists before creating order ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'quantity')::INT;
    v_sku        := UPPER(TRIM(COALESCE(v_item->'variant_info'->>'sku', '')));

    SELECT (COUNT(*) > 1) INTO v_has_variants
    FROM product_variants WHERE product_id = v_product_id;

    IF v_has_variants AND v_sku != '' THEN
      -- variant product: check variant stock
      IF (SELECT stock FROM product_variants WHERE product_id = v_product_id AND UPPER(TRIM(sku)) = v_sku LIMIT 1) < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for product % (variant: %)', v_product_id, v_sku;
      END IF;
    ELSE
      -- simple product: check product stock
      IF (SELECT stock FROM products WHERE id = v_product_id) < v_qty THEN
        RAISE EXCEPTION 'Insufficient stock for product %', v_product_id;
      END IF;
    END IF;
  END LOOP;

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
    settlement_cycle, settlement_status, idempotency_key,
    shipping_carrier, shipping_service_level, shipping_provider,
    shipping_rate_id, expected_delivery_date, expected_delivery_days
  ) VALUES (
    p_user_id, v_seller_id, p_order_status, v_safe_payment_status,
    v_total_amount, UPPER(TRIM(COALESCE(p_currency, 'INR'))), p_shipping_address, p_billing_address,
    p_phone, p_notes, v_order_number, p_payment_intent_id, p_payment_method,
    COALESCE(p_shipping_charge, 0), COALESCE(p_actual_shipping_cost, 0), COALESCE(p_platform_shipping_margin, 0),
    v_product_subtotal, v_platform_fee, v_seller_earning,
    v_settlement_cycle, 'pending',
    CASE WHEN p_idempotency_key IS NOT NULL AND TRIM(p_idempotency_key) != ''
         THEN TRIM(p_idempotency_key) ELSE NULL END,
    NULLIF(TRIM(COALESCE(p_shipping_carrier, '')), ''),
    NULLIF(TRIM(COALESCE(p_shipping_service_level, '')), ''),
    NULLIF(TRIM(COALESCE(p_shipping_provider, '')), ''),
    NULLIF(TRIM(COALESCE(p_shipping_rate_id, '')), ''),
    p_expected_delivery_date,
    p_expected_delivery_days
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

  -- ── DECREMENT STOCK ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_qty        := (v_item->>'quantity')::INT;
    v_sku        := UPPER(TRIM(COALESCE(v_item->'variant_info'->>'sku', '')));

    SELECT (COUNT(*) > 1) INTO v_has_variants
    FROM product_variants WHERE product_id = v_product_id;

    IF v_has_variants AND v_sku != '' THEN
      -- Decrement variant stock
      UPDATE product_variants
      SET stock    = GREATEST(stock - v_qty, 0),
          quantity = GREATEST(quantity - v_qty, 0),
          updated_at = now()
      WHERE product_id = v_product_id
        AND UPPER(TRIM(sku)) = v_sku;

      -- Keep product-level stock in sync with sum of variant stocks
      UPDATE products
      SET stock      = (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = v_product_id),
          updated_at = now()
      WHERE id = v_product_id;
    ELSE
      -- Simple product: decrement product stock directly
      UPDATE products
      SET stock      = GREATEST(stock - v_qty, 0),
          updated_at = now()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

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


-- =============================================================
-- 2. Restore stock when order is cancelled / returned / refunded
-- =============================================================

CREATE OR REPLACE FUNCTION public.restore_stock_on_order_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_sku TEXT;
  v_has_variants BOOLEAN;
BEGIN
  -- Only fire when status transitions INTO a terminal cancel/return state
  IF NEW.status NOT IN ('cancelled', 'returned', 'refunded') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  -- Do not restore if already restored (idempotency check)
  IF OLD.status IN ('cancelled', 'returned', 'refunded') THEN
    RETURN NEW;
  END IF;

  FOR v_item IN
    SELECT oi.product_id, oi.quantity,
           UPPER(TRIM(COALESCE(oi.variant_info->>'sku', ''))) AS sku
    FROM order_items oi
    WHERE oi.order_id = NEW.id
  LOOP
    v_sku := v_item.sku;

    SELECT (COUNT(*) > 1) INTO v_has_variants
    FROM product_variants WHERE product_id = v_item.product_id;

    IF v_has_variants AND v_sku != '' THEN
      UPDATE product_variants
      SET stock    = stock + v_item.quantity,
          quantity = quantity + v_item.quantity,
          updated_at = now()
      WHERE product_id = v_item.product_id
        AND UPPER(TRIM(sku)) = v_sku;

      UPDATE products
      SET stock      = (SELECT COALESCE(SUM(stock), 0) FROM product_variants WHERE product_id = v_item.product_id),
          updated_at = now()
      WHERE id = v_item.product_id;
    ELSE
      UPDATE products
      SET stock      = stock + v_item.quantity,
          updated_at = now()
      WHERE id = v_item.product_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restore_stock_on_cancel ON public.orders;

CREATE TRIGGER trg_restore_stock_on_cancel
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.restore_stock_on_order_cancel();
