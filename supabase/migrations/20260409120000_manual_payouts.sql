-- ═══════════════════════════════════════════
-- Manual Payout Records
-- Admin pays seller manually (bank transfer, GPay, etc.)
-- ═══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS manual_payouts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id     uuid NOT NULL REFERENCES profiles(id),
  cycle         text NOT NULL,                              -- e.g. '1-15 Apr 2026' or '16-30 Apr 2026'
  payout_date   date NOT NULL DEFAULT CURRENT_DATE,
  amount        numeric(12,2) NOT NULL CHECK (amount > 0),
  mode_of_pay   text NOT NULL CHECK (mode_of_pay IN ('account_transfer', 'gpay', 'dr_payment')),
  transaction_no text NOT NULL,
  status        text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid')),
  total_orders  integer NOT NULL DEFAULT 0,
  total_product_amount numeric(12,2) NOT NULL DEFAULT 0,
  platform_cut  numeric(12,2) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups by seller + cycle
CREATE INDEX idx_manual_payouts_seller ON manual_payouts(seller_id);
CREATE INDEX idx_manual_payouts_cycle ON manual_payouts(cycle);

-- RLS
ALTER TABLE manual_payouts ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "manual_payouts_admin_all"
  ON manual_payouts FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Sellers can read their own payouts
CREATE POLICY "manual_payouts_seller_read"
  ON manual_payouts FOR SELECT
  USING (seller_id = auth.uid());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_manual_payouts_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_manual_payouts_updated_at
  BEFORE UPDATE ON manual_payouts
  FOR EACH ROW EXECUTE FUNCTION update_manual_payouts_updated_at();
