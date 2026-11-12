-- ═══════════════════════════════════════════
-- Fix manual payouts: zero hardcoding
-- ═══════════════════════════════════════════

-- 1. Payment modes config table
CREATE TABLE IF NOT EXISTS payment_modes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text NOT NULL UNIQUE,
  label      text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO payment_modes (code, label, sort_order) VALUES
  ('account_transfer', 'Account Transfer', 1),
  ('gpay', 'GPay', 2),
  ('dr_payment', 'DR Payment', 3)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE payment_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_modes_public_read" ON payment_modes FOR SELECT USING (true);

-- 2. Relax manual_payouts.status to allow 'pending' as well
ALTER TABLE manual_payouts DROP CONSTRAINT IF EXISTS manual_payouts_status_check;
-- The check constraint name may vary; also try the auto-generated name
DO $$ BEGIN
  EXECUTE 'ALTER TABLE manual_payouts DROP CONSTRAINT IF EXISTS ' ||
    (SELECT conname FROM pg_constraint
     WHERE conrelid = 'manual_payouts'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%'
     LIMIT 1);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER TABLE manual_payouts ADD CONSTRAINT chk_manual_payout_status
  CHECK (status IN ('pending', 'paid'));

-- Update default to 'paid' (kept, since admin submits as paid)
ALTER TABLE manual_payouts ALTER COLUMN status SET DEFAULT 'paid';

-- 3. Relax mode_of_pay CHECK to reference the config table
ALTER TABLE manual_payouts DROP CONSTRAINT IF EXISTS manual_payouts_mode_of_pay_check;
DO $$ BEGIN
  EXECUTE 'ALTER TABLE manual_payouts DROP CONSTRAINT IF EXISTS ' ||
    (SELECT conname FROM pg_constraint
     WHERE conrelid = 'manual_payouts'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%mode_of_pay%'
     LIMIT 1);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
-- Now use a FK-style check via trigger (more flexible than CHECK for config table)
CREATE OR REPLACE FUNCTION validate_payment_mode()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_modes WHERE code = NEW.mode_of_pay AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid payment mode: %', NEW.mode_of_pay;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_payment_mode ON manual_payouts;
CREATE TRIGGER trg_validate_payment_mode
  BEFORE INSERT OR UPDATE ON manual_payouts
  FOR EACH ROW EXECUTE FUNCTION validate_payment_mode();

-- 4. Add currency column to manual_payouts (no hardcoded INR)
ALTER TABLE manual_payouts ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

-- 5. Server-side RPC: aggregate payout cycles from orders
CREATE OR REPLACE FUNCTION get_payout_cycle_summary()
RETURNS TABLE (
  seller_id       uuid,
  seller_name     text,
  cycle_key       text,
  cycle_label     text,
  total_orders    bigint,
  total_product_amount numeric,
  platform_cut    numeric,
  total_payable   numeric,
  currency        text,
  is_paid         boolean,
  payout_id       uuid
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  WITH order_cycles AS (
    SELECT
      o.seller_id,
      p.full_name AS seller_name,
      -- Build cycle key from order date: "YYYY-MM-H1" or "YYYY-MM-H2"
      to_char(o.created_at, 'YYYY-MM') || CASE WHEN EXTRACT(DAY FROM o.created_at) <= 15 THEN '-H1' ELSE '-H2' END AS cycle_key,
      -- Human-readable label: "1-15 Mar 2026" or "16-31 Mar 2026"
      CASE
        WHEN EXTRACT(DAY FROM o.created_at) <= 15 THEN
          '1-15 ' || to_char(o.created_at, 'Mon YYYY')
        ELSE
          '16-' || EXTRACT(DAY FROM (date_trunc('month', o.created_at) + interval '1 month' - interval '1 day'))::int::text
          || ' ' || to_char(o.created_at, 'Mon YYYY')
      END AS cycle_label,
      o.product_subtotal,
      o.platform_fee,
      o.seller_earning,
      o.currency
    FROM orders o
    JOIN profiles p ON p.id = o.seller_id
    WHERE o.seller_id IS NOT NULL
      AND o.product_subtotal IS NOT NULL
      AND o.settlement_status IN ('pending', 'settled')
  ),
  aggregated AS (
    SELECT
      oc.seller_id,
      oc.seller_name,
      oc.cycle_key,
      oc.cycle_label,
      COUNT(*)::bigint AS total_orders,
      COALESCE(SUM(oc.product_subtotal), 0) AS total_product_amount,
      COALESCE(SUM(oc.platform_fee), 0) AS platform_cut,
      COALESCE(SUM(oc.seller_earning), 0) AS total_payable,
      -- Use the most common currency for this seller's cycle
      MODE() WITHIN GROUP (ORDER BY oc.currency) AS currency
    FROM order_cycles oc
    GROUP BY oc.seller_id, oc.seller_name, oc.cycle_key, oc.cycle_label
  )
  SELECT
    a.seller_id,
    a.seller_name,
    a.cycle_key,
    a.cycle_label,
    a.total_orders,
    a.total_product_amount,
    a.platform_cut,
    a.total_payable,
    a.currency,
    (mp.id IS NOT NULL) AS is_paid,
    mp.id AS payout_id
  FROM aggregated a
  LEFT JOIN manual_payouts mp
    ON mp.seller_id = a.seller_id AND mp.cycle = a.cycle_label
  ORDER BY a.cycle_key DESC, a.seller_name;
$$;

-- 6. RPC: get active commission rate
CREATE OR REPLACE FUNCTION get_platform_commission_rate()
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT charge_percent FROM platform_commission_rules WHERE is_active = true ORDER BY created_at DESC LIMIT 1),
    9
  );
$$;
