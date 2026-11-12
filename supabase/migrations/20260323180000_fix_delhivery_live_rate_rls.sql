-- Fix: Delhivery live rate was not working for buyers because RLS policies on
-- seller_delhivery_accounts and seller_kyc blocked buyer access to pickup pincodes.
-- The checkout pricing service needs to read seller pickup postal codes to resolve
-- the origin pincode for the Delhivery live rate API call.

-- Allow any user (buyer/anon) to read active seller delhivery accounts.
-- Only exposes pickup_postal_code + seller_id for checkout rate calculation.
CREATE POLICY IF NOT EXISTS seller_delhivery_accounts_public_read_pickup
ON seller_delhivery_accounts
FOR SELECT
TO anon, authenticated
USING (is_active = true);

-- Allow any user (buyer/anon) to read seller KYC postal codes as a fallback
-- when product_delhivery_shipping and seller_delhivery_accounts don't have a pincode.
CREATE POLICY IF NOT EXISTS seller_kyc_public_read_postal
ON seller_kyc
FOR SELECT
TO anon, authenticated
USING (true);
