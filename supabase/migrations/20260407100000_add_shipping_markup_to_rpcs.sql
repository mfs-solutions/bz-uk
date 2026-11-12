-- ============================================================
-- Add shipping_markup aggregate to both account RPCs
-- Platform Profit = 9% commission + shipping markup
-- Stripe Fee (3%) shown separately — NOT counted as profit
-- ============================================================

DROP FUNCTION IF EXISTS public.get_account_summary_safe(TEXT, DATE, DATE);
DROP FUNCTION IF EXISTS public.get_daily_profit_breakup(DATE, DATE, DATE);

-- 1. get_account_summary_safe — now returns shipping_markup, net profit includes it
CREATE OR REPLACE FUNCTION public.get_account_summary_safe(
  p_currency TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
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
  v_refunds NUMERIC;
  v_shipping_markup NUMERIC;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;

  SELECT
    COALESCE(SUM(o.product_subtotal), COALESCE(SUM(o.total_amount), 0)),
    COALESCE(SUM(o.platform_fee), 0),
    COALESCE(SUM(o.seller_earning), 0),
    COUNT(*),
    COALESCE(SUM(o.platform_shipping_margin), 0)
  INTO v_total_revenue, v_total_platform_fees, v_total_seller_earnings, v_order_count, v_shipping_markup
  FROM orders o
  WHERE o.payment_status IN ('paid', 'completed', 'succeeded')
    AND o.status NOT IN ('cancelled', 'refunded', 'returned')
    AND (p_currency IS NULL OR UPPER(TRIM(COALESCE(o.currency, 'USD'))) = UPPER(TRIM(p_currency)))
    AND (p_start_date IS NULL OR o.created_at::date >= p_start_date)
    AND (p_end_date IS NULL OR o.created_at::date <= p_end_date);

  SELECT COALESCE(SUM(o.total_amount), 0)
  INTO v_refunds
  FROM orders o
  WHERE o.status IN ('refunded', 'returned')
    AND (p_start_date IS NULL OR o.created_at::date >= p_start_date)
    AND (p_end_date IS NULL OR o.created_at::date <= p_end_date);

  SELECT
    COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END), 0)
  INTO v_total_wallet_credits, v_total_wallet_debits
  FROM seller_wallet_transactions;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_payouts
  FROM seller_wallet_transactions
  WHERE type = 'debit' AND source = 'withdrawal';

  RETURN jsonb_build_object(
    'order_count', v_order_count,
    'total_revenue', v_total_revenue,
    'platform_fees', v_total_platform_fees,
    'seller_earnings', v_total_seller_earnings,
    'total_payouts', v_total_payouts,
    'refunds', v_refunds,
    'wallet_credits', v_total_wallet_credits,
    'wallet_debits', v_total_wallet_debits,
    'wallet_balance', v_total_wallet_credits - v_total_wallet_debits,
    'shipping_markup', v_shipping_markup,
    'net_platform_profit', v_total_platform_fees + v_shipping_markup - v_refunds
  );
END;
$$;

-- 2. get_daily_profit_breakup — now returns shipping_markup
CREATE OR REPLACE FUNCTION public.get_daily_profit_breakup(
  p_date DATE DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
  v_start date;
  v_end date;
BEGIN
  IF p_date IS NOT NULL THEN
    v_start := p_date;
    v_end := p_date;
  ELSIF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := p_start_date;
    v_end := p_end_date;
  ELSE
    v_start := NULL;
    v_end := NULL;
  END IF;

  SELECT json_build_object(
    'date', COALESCE(p_date, current_date),
    'gmv', coalesce((
      SELECT sum(total_amount) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status NOT IN ('cancelled','refunded','returned')
        AND payment_status IN ('paid','completed','succeeded')
    ), 0),
    'seller_cost', coalesce((
      SELECT sum(seller_earning) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status NOT IN ('cancelled','refunded','returned')
        AND payment_status IN ('paid','completed','succeeded')
    ), 0),
    'shipping_cost', coalesce((
      SELECT sum(actual_shipping_cost) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status NOT IN ('cancelled','refunded','returned')
        AND payment_status IN ('paid','completed','succeeded')
    ), 0),
    'shipping_markup', coalesce((
      SELECT sum(platform_shipping_margin) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status NOT IN ('cancelled','refunded','returned')
        AND payment_status IN ('paid','completed','succeeded')
    ), 0),
    'platform_fee', coalesce((
      SELECT sum(platform_fee) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status NOT IN ('cancelled','refunded','returned')
        AND payment_status IN ('paid','completed','succeeded')
    ), 0),
    'refunds', coalesce((
      SELECT sum(total_amount) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status IN ('refunded','returned')
    ), 0),
    'expenses', coalesce((
      SELECT sum(amount) FROM expense_entries
      WHERE (v_start IS NULL OR expense_date >= v_start)
        AND (v_end IS NULL OR expense_date <= v_end)
    ), 0),
    'order_count', coalesce((
      SELECT count(*) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status NOT IN ('cancelled','refunded','returned')
        AND payment_status IN ('paid','completed','succeeded')
    ), 0),
    'commission_earned', coalesce((
      SELECT sum(platform_fee) FROM orders
      WHERE (v_start IS NULL OR created_at::date >= v_start)
        AND (v_end IS NULL OR created_at::date <= v_end)
        AND status NOT IN ('cancelled','refunded','returned')
        AND payment_status IN ('paid','completed','succeeded')
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_summary_safe TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_profit_breakup TO authenticated;
