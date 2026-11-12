-- ============================================================
-- Add Shiprocket-specific columns to seller_pickup_locations
-- so we can sync warehouse data to Shiprocket API and track
-- OTP verification status.
-- ============================================================

-- Additional address fields matching Shiprocket API
ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS address_2 text NOT NULL DEFAULT '';

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS lat double precision;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS long double precision;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS address_type text;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS vendor_name text;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS gstin text;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS is_hyperlocal boolean NOT NULL DEFAULT false;

-- Shiprocket API response fields
ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_id bigint;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS shiprocket_pickup_code text;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS shiprocket_company_id bigint;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS shiprocket_status integer NOT NULL DEFAULT 0;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS phone_verified integer NOT NULL DEFAULT 0;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS shiprocket_rto_address_id bigint;

-- Sync / OTP tracking
ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS shiprocket_synced boolean NOT NULL DEFAULT false;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS otp_requested_at timestamptz;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS otp_verified_at timestamptz;

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Index on shiprocket_pickup_id for fast lookups
CREATE INDEX IF NOT EXISTS idx_seller_pickup_shiprocket_id
  ON public.seller_pickup_locations (shiprocket_pickup_id)
  WHERE shiprocket_pickup_id IS NOT NULL;
