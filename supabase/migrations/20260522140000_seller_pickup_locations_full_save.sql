-- Extend seller_pickup_locations so the seller-side form can persist EVERY
-- input field (working days, return address split, sync error history).
-- The seller no longer triggers Shiprocket/Shippo sync directly; an admin
-- triggers sync from the Admin → Seller Warehouse page, and any failure is
-- written back to `last_sync_error` so it can be shown verbatim in the UI.

ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS working_days          text[]                 NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS use_pickup_as_return  boolean                NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS return_address        text                   NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS return_city           text                   NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS return_pin            text                   NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS return_state          text                   NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS return_country        text                   NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS last_sync_error       text,
  ADD COLUMN IF NOT EXISTS last_sync_attempt_at  timestamptz,
  ADD COLUMN IF NOT EXISTS last_synced_at        timestamptz;
