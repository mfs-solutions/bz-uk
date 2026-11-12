-- Final Delhivery cleanup: remove all remaining DB remnants
-- All Delhivery tables were already dropped by 20260414130000_drop_all_delhivery_tables.sql
-- This migration cleans up leftover RPC functions, config rows, and table comments.

-- 1. Drop leftover RPC function
DROP FUNCTION IF EXISTS public.get_active_delhivery_shipments();

-- 2. Remove delhivery rows from shipping_provider_config (if any remain)
DELETE FROM public.shipping_provider_config WHERE provider = 'delhivery';

-- 3. Update table comment to remove delhivery mention
COMMENT ON TABLE public.shipping_provider_config IS
  'Controls which shipping provider (shippo/shiprocket) handles domestic and international shipping for each origin country. Markup amounts are baked into rates.';
