-- Drop 9 unused tables that have zero references in application code
-- Verified: no foreign keys reference these tables

DROP TABLE IF EXISTS public.auth_user_roles CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.financial_audit_log CASCADE;
DROP TABLE IF EXISTS public.pickup_time_slots CASCADE;
DROP TABLE IF EXISTS public.product_shiprocket_shipping CASCADE;
DROP TABLE IF EXISTS public.seller_shiprocket_accounts CASCADE;
DROP TABLE IF EXISTS public.shiprocket_pickup_requests CASCADE;
DROP TABLE IF EXISTS public.tax_rules CASCADE;
DROP TABLE IF EXISTS public.shipments CASCADE;
