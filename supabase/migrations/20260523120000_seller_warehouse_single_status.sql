-- Seller Warehouse: single record per seller + admin review status
-- ──────────────────────────────────────────────────────────────────────
-- One pickup location per seller (Shiprocket confirmed: one is enough for
-- both domestic + international). Admin reviews, edits, syncs, or rejects.
-- Seller never sees a sync error; only sees Pending / Created / Rejected.

-- 1. Status workflow columns
ALTER TABLE public.seller_pickup_locations
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seller_pickup_locations_status_check'
  ) THEN
    ALTER TABLE public.seller_pickup_locations
      ADD CONSTRAINT seller_pickup_locations_status_check
      CHECK (status IN ('pending', 'synced', 'rejected'));
  END IF;
END $$;

-- 2. Backfill status from existing flags
UPDATE public.seller_pickup_locations
  SET status = CASE
    WHEN shiprocket_synced = true OR shippo_synced = true THEN 'synced'
    ELSE 'pending'
  END
WHERE status = 'pending';

-- 3. Collapse duplicate rows per seller: keep the most recently updated row.
WITH ranked AS (
  SELECT id,
         seller_id,
         ROW_NUMBER() OVER (
           PARTITION BY seller_id
           ORDER BY
             (status = 'synced') DESC,
             updated_at DESC,
             created_at DESC
         ) AS rn
  FROM public.seller_pickup_locations
)
DELETE FROM public.seller_pickup_locations spl
USING ranked
WHERE spl.id = ranked.id
  AND ranked.rn > 1;

-- 4. Drop old composite unique, add unique on seller_id only.
ALTER TABLE public.seller_pickup_locations
  DROP CONSTRAINT IF EXISTS seller_pickup_locations_unique;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'seller_pickup_locations_seller_id_unique'
  ) THEN
    ALTER TABLE public.seller_pickup_locations
      ADD CONSTRAINT seller_pickup_locations_seller_id_unique
      UNIQUE (seller_id);
  END IF;
END $$;

-- 5. Index for status lookups
CREATE INDEX IF NOT EXISTS idx_seller_pickup_locations_status
  ON public.seller_pickup_locations(status);

-- 6. Allow new notification types for warehouse review workflow
DO $$
DECLARE
  cur_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO cur_def
  FROM pg_constraint
  WHERE conname = 'notifications_type_check'
    AND conrelid = 'public.notifications'::regclass;

  IF cur_def IS NOT NULL
     AND position('warehouse_rejected' in cur_def) = 0 THEN
    ALTER TABLE public.notifications
      DROP CONSTRAINT notifications_type_check;
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check
      CHECK (type IN (
        'identity_approved','identity_rejected','identity_pending',
        'product_approved','product_rejected',
        'order_new','order_cancelled','order_placed','order_accepted','order_rejected',
        'order_shipped','order_delivered','order_picked_up',
        'label_ready','return_requested','return_approved','return_rejected',
        'refund_processed','payout_completed','payout_failed',
        'warehouse_approved','warehouse_rejected','warehouse_pending',
        'system','info'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.seller_pickup_locations.status IS
  'pending = awaiting admin sync; synced = pushed to Shiprocket; rejected = admin sent back to seller with rejection_reason.';
