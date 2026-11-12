-- ============================================================
-- Shipping provider configuration per origin country
-- Drives routing: which provider handles domestic & international
-- shipping for sellers based in each country.
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_provider_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code   text NOT NULL,          -- ISO 3166-1 alpha-2 (e.g. 'GB', 'DE', 'FR')
  country_name   text NOT NULL,          -- Human-readable name
  provider       text NOT NULL,          -- 'shippo', 'delhivery', 'shiprocket'
  domestic       boolean NOT NULL DEFAULT true,
  international  boolean NOT NULL DEFAULT true,
  markup_domestic   numeric(10,2) NOT NULL DEFAULT 0,  -- platform markup in provider currency
  markup_intl       numeric(10,2) NOT NULL DEFAULT 0,  -- platform markup in provider currency
  markup_currency   text NOT NULL DEFAULT 'GBP',       -- currency of markup amounts
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_code, provider)
);

-- Enable RLS
ALTER TABLE shipping_provider_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed by checkout frontend + edge functions)
CREATE POLICY "shipping_provider_config_select"
  ON shipping_provider_config FOR SELECT
  USING (true);

-- Only service_role can modify
CREATE POLICY "shipping_provider_config_admin_all"
  ON shipping_provider_config FOR ALL
  USING (auth.role() = 'service_role');

-- Seed the supported countries
INSERT INTO shipping_provider_config (country_code, country_name, provider, domestic, international, markup_domestic, markup_intl, markup_currency)
VALUES
  -- UK (existing)
  ('GB', 'United Kingdom', 'shippo', true, true, 1.05, 1.60, 'GBP'),
  -- Germany
  ('DE', 'Germany', 'shippo', true, true, 1.05, 1.60, 'EUR'),
  -- France
  ('FR', 'France', 'shippo', true, true, 1.05, 1.60, 'EUR'),
  -- Spain
  ('ES', 'Spain', 'shippo', true, true, 1.05, 1.60, 'EUR'),
  -- USA
  ('US', 'United States', 'shippo', true, true, 1.50, 2.00, 'USD'),
  -- Canada
  ('CA', 'Canada', 'shippo', true, true, 1.50, 2.00, 'CAD'),
  -- India (Shiprocket handles both domestic and international)
  ('IN', 'India', 'shiprocket', true, true, 125.00, 125.00, 'INR')
ON CONFLICT (country_code, provider) DO NOTHING;

COMMENT ON TABLE shipping_provider_config IS 'Controls which shipping provider (shippo/delhivery/shiprocket) handles domestic and international shipping for each origin country. Markup amounts are baked into rates.';
