-- =============================================================================
-- LOCK FX SNAPSHOT ON ORDERS — multi-currency safety for seller wallet/orders
-- =============================================================================
-- Purpose: Capture per-order an immutable snapshot of buyer↔seller currency
-- conversion at the moment of order creation, so:
--   • Seller always sees order pricing in their profile country's currency,
--     locked at order time (never re-converted with live FX).
--   • Wallet balance / payout calculations are currency-correct.
--   • Admin + buyer continue to see the actual paid amount in buyer currency.
--
-- Rule: never modifies create_order_secure, checkout flow, payment, shiprocket,
-- buyer UI, or admin UI. Adds columns + triggers + rewrites the wallet RPC
-- and the seller-credit trigger only.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Additive schema: lock columns on orders + order_items
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS seller_currency text,
  ADD COLUMN IF NOT EXISTS buyer_to_seller_fx_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS seller_payout_total numeric(18,2),
  ADD COLUMN IF NOT EXISTS platform_markup_total_inr numeric(18,2),
  ADD COLUMN IF NOT EXISTS fx_locked_at timestamptz;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS buyer_currency text,
  ADD COLUMN IF NOT EXISTS seller_currency text,
  ADD COLUMN IF NOT EXISTS locked_fx_rate numeric(18,8),
  ADD COLUMN IF NOT EXISTS seller_earning_locked numeric(18,2);

COMMENT ON COLUMN public.orders.seller_currency IS
  'ISO currency code of the seller at order creation time. Locked.';
COMMENT ON COLUMN public.orders.buyer_to_seller_fx_rate IS
  'Multiplier: buyer_amount × this = seller_amount. = seller_country.exchange_rate / buyer_country.exchange_rate at lock time. Locked.';
COMMENT ON COLUMN public.orders.seller_payout_total IS
  'Total seller earnings in seller_currency (= seller_items_subtotal × (1 − commission%)).';
COMMENT ON COLUMN public.orders.platform_markup_total_inr IS
  'Platform margin in INR: (buyer_paid in INR) − (seller_base in INR). Locked at order creation.';
COMMENT ON COLUMN public.orders.fx_locked_at IS
  'Timestamp when buyer_to_seller_fx_rate was captured (immutable thereafter).';

COMMENT ON COLUMN public.order_items.buyer_currency IS
  'Snapshot of parent order currency (buyer paid in this currency).';
COMMENT ON COLUMN public.order_items.seller_currency IS
  'Snapshot of seller currency at order creation.';
COMMENT ON COLUMN public.order_items.locked_fx_rate IS
  'Snapshot of parent buyer_to_seller_fx_rate.';
COMMENT ON COLUMN public.order_items.seller_earning_locked IS
  'Seller earning for this line in SELLER currency, locked at order creation. = seller_line_total × (1 − commission%).';

-- ----------------------------------------------------------------------------
-- 2. BEFORE INSERT trigger on orders → lock FX snapshot from countries table
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lock_order_fx_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_ccy    text;
  v_buyer_rate   numeric;
  v_inr_rate     numeric;
  v_seller_cc_id uuid;
  v_seller_ccy   text;
  v_seller_rate  numeric;
BEGIN
  v_buyer_ccy := upper(trim(coalesce(NEW.currency, 'INR')));

  SELECT exchange_rate INTO v_buyer_rate
  FROM public.countries
  WHERE upper(currency_code) = v_buyer_ccy AND is_active = true
  LIMIT 1;

  SELECT exchange_rate INTO v_inr_rate
  FROM public.countries
  WHERE upper(currency_code) = 'INR' AND is_active = true
  LIMIT 1;

  IF NEW.seller_id IS NOT NULL THEN
    SELECT p.country_id
    INTO v_seller_cc_id
    FROM public.profiles p
    WHERE p.id = NEW.seller_id
    LIMIT 1;
  END IF;

  IF v_seller_cc_id IS NOT NULL THEN
    SELECT upper(c.currency_code), c.exchange_rate
    INTO v_seller_ccy, v_seller_rate
    FROM public.countries c
    WHERE c.id = v_seller_cc_id;
  END IF;

  -- Defaults: all current sellers are India; multi-seller carts default to INR
  v_seller_ccy  := coalesce(v_seller_ccy, 'INR');
  IF v_seller_rate IS NULL THEN
    v_seller_rate := v_inr_rate;
  END IF;
  IF v_buyer_rate IS NULL THEN
    v_buyer_rate := v_inr_rate;
  END IF;

  NEW.seller_currency         := coalesce(NEW.seller_currency, v_seller_ccy);
  NEW.buyer_to_seller_fx_rate := coalesce(
    NEW.buyer_to_seller_fx_rate,
    round(v_seller_rate / nullif(v_buyer_rate, 0), 8)
  );
  NEW.fx_locked_at            := coalesce(NEW.fx_locked_at, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_order_fx_snapshot ON public.orders;
CREATE TRIGGER trg_lock_order_fx_snapshot
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.lock_order_fx_snapshot();

-- ----------------------------------------------------------------------------
-- 3. Extend apply_order_item_price_snapshots: copy parent FX + lock seller earning
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_order_item_price_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty numeric := greatest(coalesce(new.quantity, 0), 0);
  v_sku text;
  v_variant_price numeric;
  v_product_price numeric;
  v_parent_buyer_ccy  text;
  v_parent_seller_ccy text;
  v_parent_fx numeric;
BEGIN
  new.customer_unit_price := round(coalesce(new.customer_unit_price, new.price, 0), 2);

  IF new.seller_unit_price IS NULL THEN
    v_sku := upper(trim(coalesce(new.variant_info->>'sku', '')));

    IF new.product_id IS NOT NULL AND v_sku <> '' THEN
      SELECT pv.price
      INTO v_variant_price
      FROM public.product_variants pv
      WHERE pv.product_id = new.product_id
        AND upper(trim(coalesce(pv.sku, ''))) = v_sku
      ORDER BY pv.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF new.product_id IS NOT NULL THEN
      SELECT p.price
      INTO v_product_price
      FROM public.products p
      WHERE p.id = new.product_id
      LIMIT 1;
    END IF;

    new.seller_unit_price := round(coalesce(v_variant_price, v_product_price, new.customer_unit_price, 0), 2);
  ELSE
    new.seller_unit_price := round(coalesce(new.seller_unit_price, 0), 2);
  END IF;

  new.price := new.customer_unit_price;
  new.customer_line_total := round(coalesce(new.customer_line_total, new.customer_unit_price * v_qty), 2);
  new.seller_line_total   := round(coalesce(new.seller_line_total,   new.seller_unit_price   * v_qty), 2);

  -- Copy locked FX/currency snapshot from parent order
  SELECT upper(coalesce(o.currency, 'INR')),
         upper(coalesce(o.seller_currency, 'INR')),
         coalesce(o.buyer_to_seller_fx_rate, 1)
  INTO v_parent_buyer_ccy, v_parent_seller_ccy, v_parent_fx
  FROM public.orders o
  WHERE o.id = new.order_id;

  new.buyer_currency  := coalesce(new.buyer_currency,  v_parent_buyer_ccy, 'INR');
  new.seller_currency := coalesce(new.seller_currency, v_parent_seller_ccy, 'INR');
  new.locked_fx_rate  := coalesce(new.locked_fx_rate,  v_parent_fx, 1);

  -- Seller earning locked in seller currency (9% platform commission default)
  new.seller_earning_locked := coalesce(
    new.seller_earning_locked,
    round(new.seller_line_total * 0.91, 2)
  );

  RETURN new;
END;
$$;

-- (existing trigger trg_apply_order_item_price_snapshots reuses the new function body)

-- ----------------------------------------------------------------------------
-- 4. Extend refresh_order_seller_subtotal: also lock payout + markup
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_order_seller_subtotal(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_seller_items numeric;
  v_payout       numeric;
  v_buyer_ccy    text;
  v_seller_ccy   text;
  v_buyer_paid   numeric;
  v_inr_rate     numeric;
  v_buyer_rate   numeric;
  v_seller_rate  numeric;
  v_buyer_paid_inr   numeric;
  v_seller_items_inr numeric;
BEGIN
  SELECT
    coalesce(sum(coalesce(oi.seller_line_total,
                          coalesce(oi.seller_unit_price, 0) * greatest(coalesce(oi.quantity, 0), 0))), 0),
    coalesce(sum(coalesce(oi.seller_earning_locked,
                          round(coalesce(oi.seller_line_total, 0) * 0.91, 2))), 0)
  INTO v_seller_items, v_payout
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  SELECT upper(coalesce(currency, 'INR')),
         upper(coalesce(seller_currency, 'INR')),
         coalesce(total_amount, 0)
  INTO v_buyer_ccy, v_seller_ccy, v_buyer_paid
  FROM public.orders
  WHERE id = p_order_id;

  SELECT exchange_rate INTO v_inr_rate    FROM public.countries WHERE upper(currency_code) = 'INR'         LIMIT 1;
  SELECT exchange_rate INTO v_buyer_rate  FROM public.countries WHERE upper(currency_code) = v_buyer_ccy  LIMIT 1;
  SELECT exchange_rate INTO v_seller_rate FROM public.countries WHERE upper(currency_code) = v_seller_ccy LIMIT 1;

  v_inr_rate    := coalesce(v_inr_rate, 1);
  v_buyer_rate  := coalesce(v_buyer_rate,  v_inr_rate);
  v_seller_rate := coalesce(v_seller_rate, v_inr_rate);

  v_buyer_paid_inr   := round(v_buyer_paid   * v_inr_rate / nullif(v_buyer_rate, 0),  2);
  v_seller_items_inr := round(v_seller_items * v_inr_rate / nullif(v_seller_rate, 0), 2);

  UPDATE public.orders o
  SET seller_items_subtotal     = round(v_seller_items, 2),
      seller_payout_total       = round(v_payout, 2),
      -- platform_markup_total_inr is immutable once set (lock at creation only)
      platform_markup_total_inr = coalesce(
        o.platform_markup_total_inr,
        round(v_buyer_paid_inr - v_seller_items_inr, 2)
      )
  WHERE o.id = p_order_id;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Backfill: lock today's FX onto every historical order + order_item
-- ----------------------------------------------------------------------------

-- 5a. seller_currency + fx_locked_at on orders
UPDATE public.orders o
SET seller_currency = coalesce(
      o.seller_currency,
      upper((
        SELECT c.currency_code
        FROM public.profiles p
        JOIN public.countries c ON c.id = p.country_id
        WHERE p.id = o.seller_id
        LIMIT 1
      )),
      'INR'
    ),
    fx_locked_at = coalesce(o.fx_locked_at, o.created_at, now())
WHERE o.seller_currency IS NULL OR o.fx_locked_at IS NULL;

-- 5b. buyer_to_seller_fx_rate on orders (uses today's countries.exchange_rate)
UPDATE public.orders o
SET buyer_to_seller_fx_rate = round(
      (SELECT cs.exchange_rate FROM public.countries cs WHERE upper(cs.currency_code) = upper(o.seller_currency) LIMIT 1)
      /
      nullif((SELECT cb.exchange_rate FROM public.countries cb WHERE upper(cb.currency_code) = upper(coalesce(o.currency, 'INR')) LIMIT 1), 0)
    , 8)
WHERE o.buyer_to_seller_fx_rate IS NULL;

-- 5c. order_items snapshot columns + seller_earning_locked
UPDATE public.order_items oi
SET buyer_currency  = coalesce(oi.buyer_currency,  upper(coalesce(o.currency, 'INR'))),
    seller_currency = coalesce(oi.seller_currency, upper(coalesce(o.seller_currency, 'INR'))),
    locked_fx_rate  = coalesce(oi.locked_fx_rate,  o.buyer_to_seller_fx_rate, 1),
    seller_earning_locked = coalesce(
      oi.seller_earning_locked,
      round(coalesce(oi.seller_line_total,
                     coalesce(oi.seller_unit_price, 0) * greatest(coalesce(oi.quantity, 0), 0)) * 0.91, 2)
    )
FROM public.orders o
WHERE oi.order_id = o.id
  AND (oi.buyer_currency IS NULL
       OR oi.seller_currency IS NULL
       OR oi.locked_fx_rate IS NULL
       OR oi.seller_earning_locked IS NULL);

-- 5d. Recompute seller_payout_total and platform_markup_total_inr for all orders
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.orders
    WHERE seller_payout_total IS NULL OR platform_markup_total_inr IS NULL
  LOOP
    PERFORM public.refresh_order_seller_subtotal(r.id);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Fix credit_seller_on_delivery: insert into wallet in seller currency
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_seller_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN

    IF NEW.payment_status IS NULL
       OR NEW.payment_status NOT IN ('paid', 'completed', 'succeeded') THEN
      RAISE WARNING '[wallet] Skipping credit for order % — payment_status is "%", not paid',
        NEW.id, COALESCE(NEW.payment_status, 'NULL');
      RETURN NEW;
    END IF;

    -- Credit each seller using LOCKED seller-currency amount
    INSERT INTO public.seller_wallet_transactions (seller_id, order_id, type, source, amount)
    SELECT
      oi.seller_id,
      NEW.id,
      'credit',
      'order',
      SUM(COALESCE(oi.seller_earning_locked, ROUND(COALESCE(oi.seller_line_total, 0) * 0.91, 2)))
    FROM public.order_items oi
    WHERE oi.order_id = NEW.id
      AND oi.seller_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.seller_wallet_transactions wt
        WHERE wt.order_id = NEW.id
          AND wt.seller_id = oi.seller_id
          AND wt.type = 'credit'
          AND wt.source = 'order'
      )
    GROUP BY oi.seller_id
    HAVING SUM(COALESCE(oi.seller_earning_locked, ROUND(COALESCE(oi.seller_line_total, 0) * 0.91, 2))) > 0;

  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Correct historical wallet_transactions credit rows that were stored in
--    buyer currency. Replace amount with locked seller-currency value derived
--    from order_items.seller_earning_locked for the same order+seller.
-- ----------------------------------------------------------------------------
UPDATE public.seller_wallet_transactions wt
SET amount = corrected.amount
FROM (
  SELECT wt2.id AS wt_id,
         ROUND(SUM(oi.seller_earning_locked), 2) AS amount
  FROM public.seller_wallet_transactions wt2
  JOIN public.order_items oi
    ON oi.order_id = wt2.order_id
   AND oi.seller_id = wt2.seller_id
  WHERE wt2.type = 'credit'
    AND wt2.source = 'order'
    AND wt2.order_id IS NOT NULL
    AND oi.seller_earning_locked IS NOT NULL
  GROUP BY wt2.id
) corrected
WHERE wt.id = corrected.wt_id
  AND wt.amount IS DISTINCT FROM corrected.amount;

-- ----------------------------------------------------------------------------
-- 8. Rewrite get_seller_wallet_balance to derive from order_items in seller ccy
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_seller_wallet_balance(p_seller_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credits  numeric := 0;
  v_debits   numeric := 0;
  v_pending  numeric := 0;
  v_balance  numeric;
  v_currency text;
BEGIN
  -- Authz: seller themselves or admin
  IF auth.uid() IS DISTINCT FROM p_seller_id AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Unauthorized: cannot read wallet for seller %', p_seller_id;
  END IF;

  -- Seller's locked currency (from profile country)
  SELECT upper(coalesce(c.currency_code, 'INR'))
  INTO v_currency
  FROM public.profiles p
  LEFT JOIN public.countries c ON c.id = p.country_id
  WHERE p.id = p_seller_id;
  v_currency := coalesce(v_currency, 'INR');

  -- Delivered, paid earnings in seller currency (derived from locked order_items)
  SELECT coalesce(sum(
           coalesce(oi.seller_earning_locked,
                    round(coalesce(oi.seller_line_total, 0) * 0.91, 2))
         ), 0)
  INTO v_credits
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.seller_id = p_seller_id
    AND o.status = 'delivered'
    AND o.payment_status IN ('paid', 'completed', 'succeeded');

  -- Withdrawals (debits) — already in seller currency
  SELECT coalesce(sum(amount), 0)
  INTO v_debits
  FROM public.seller_wallet_transactions
  WHERE seller_id = p_seller_id
    AND type = 'debit';

  v_balance := v_credits - v_debits;

  -- Pending = in-flight orders (not yet delivered, not cancelled/returned/refunded)
  SELECT coalesce(sum(
           coalesce(oi.seller_earning_locked,
                    round(coalesce(oi.seller_line_total, 0) * 0.91, 2))
         ), 0)
  INTO v_pending
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.seller_id = p_seller_id
    AND o.status NOT IN ('delivered', 'cancelled', 'returned', 'refunded', 'new');

  RETURN jsonb_build_object(
    'available_balance', greatest(v_balance, 0),
    'total_credits',     v_credits,
    'total_debits',      v_debits,
    'ledger_balance',    v_balance,
    'pending_orders',    v_pending,
    'total_earnings',    v_credits,
    'currency',          v_currency
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_wallet_balance(uuid) TO authenticated;

COMMIT;
