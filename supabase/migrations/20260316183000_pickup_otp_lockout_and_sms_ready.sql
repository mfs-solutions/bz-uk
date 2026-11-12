-- Add OTP abuse-protection fields to pickup_location_otps
ALTER TABLE public.pickup_location_otps
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_pickup_location_otps_lock_window
  ON public.pickup_location_otps (seller_id, warehouse_type, verified, locked_until);
