-- =============================================================
-- Fix platform commission: 3% domestic (INR), 0% international
-- =============================================================
-- The create_order_secure function (from 20260422170000) already has
-- zone-aware commission lookup. These UPDATEs ensure the correct
-- charge_percent values are present in platform_commission_rules.
-- =============================================================

-- Domestic (null zone) rule → 3%
UPDATE public.platform_commission_rules
SET charge_percent = 3,
    extra_charge   = 0,
    updated_at     = now()
WHERE zone_code IS NULL
  AND country_id IS NULL
  AND is_active = true;

-- International (UK zone) rule → 0%
UPDATE public.platform_commission_rules
SET charge_percent = 0,
    extra_charge   = 0,
    updated_at     = now()
WHERE zone_code = 'UK'
  AND is_active = true;
