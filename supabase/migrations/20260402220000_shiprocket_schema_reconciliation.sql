-- ============================================================
-- Shiprocket Schema Reconciliation
-- 
-- The old migration (20260326) created tables with column names like
-- shiprocket_order_id, shiprocket_shipment_id, awb_code, etc.
-- The new migration (20260401) used CREATE TABLE IF NOT EXISTS with
-- new names (sr_order_id, sr_shipment_id, awb_number, etc.) which
-- was a no-op because the tables already existed.
-- 
-- This migration reconciles the schema by renaming/adding columns
-- so the production DB matches what the application code expects.
-- Fully idempotent — safe to run on any state.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. shiprocket_shipments: Rename awb_code → awb_number
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_shipments'
      AND column_name = 'awb_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_shipments'
      AND column_name = 'awb_number'
  ) THEN
    ALTER TABLE public.shiprocket_shipments RENAME COLUMN awb_code TO awb_number;
  END IF;
END $$;

-- ============================================================
-- 2. shiprocket_shipments: Add sr_order_id, migrate from shiprocket_order_id
-- ============================================================
ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS sr_order_id bigint;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_shipments'
      AND column_name = 'shiprocket_order_id'
  ) THEN
    UPDATE public.shiprocket_shipments
    SET sr_order_id = shiprocket_order_id::bigint
    WHERE shiprocket_order_id IS NOT NULL
      AND shiprocket_order_id ~ '^\d+$'
      AND sr_order_id IS NULL;
  END IF;
END $$;

-- ============================================================
-- 3. shiprocket_shipments: Add sr_shipment_id, migrate from shiprocket_shipment_id
-- ============================================================
ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS sr_shipment_id bigint;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_shipments'
      AND column_name = 'shiprocket_shipment_id'
  ) THEN
    UPDATE public.shiprocket_shipments
    SET sr_shipment_id = shiprocket_shipment_id::bigint
    WHERE shiprocket_shipment_id IS NOT NULL
      AND shiprocket_shipment_id ~ '^\d+$'
      AND sr_shipment_id IS NULL;
  END IF;
END $$;

-- ============================================================
-- 4. shiprocket_shipments: Rename charged_amount → invoice_value
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_shipments'
      AND column_name = 'charged_amount'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_shipments'
      AND column_name = 'invoice_value'
  ) THEN
    ALTER TABLE public.shiprocket_shipments RENAME COLUMN charged_amount TO invoice_value;
  END IF;
END $$;

-- ============================================================
-- 5. shiprocket_shipments: Add missing columns
-- ============================================================
ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS courier_id integer;

ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS destination_country text;

ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS destination_country_code varchar(3);

ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS invoice_currency text NOT NULL DEFAULT 'INR';

ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS label_url text;

ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS manifest_url text;

ALTER TABLE public.shiprocket_shipments
  ADD COLUMN IF NOT EXISTS sr_channel_order_id text;

-- Copy courier_company_id → courier_id for existing rows
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_shipments'
      AND column_name = 'courier_company_id'
  ) THEN
    UPDATE public.shiprocket_shipments
    SET courier_id = courier_company_id::integer
    WHERE courier_company_id IS NOT NULL
      AND courier_company_id ~ '^\d+$'
      AND courier_id IS NULL;
  END IF;
END $$;

-- Index on sr_order_id (matches new migration expectation)
CREATE INDEX IF NOT EXISTS idx_shiprocket_shipments_sr_order_id
  ON public.shiprocket_shipments (sr_order_id);

-- ============================================================
-- 6. shiprocket_tracking_events: Rename status → sr_status
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_tracking_events'
      AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_tracking_events'
      AND column_name = 'sr_status'
  ) THEN
    ALTER TABLE public.shiprocket_tracking_events RENAME COLUMN status TO sr_status;
  END IF;
END $$;

-- ============================================================
-- 7. shiprocket_tracking_events: Rename remarks → activity
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_tracking_events'
      AND column_name = 'remarks'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_tracking_events'
      AND column_name = 'activity'
  ) THEN
    ALTER TABLE public.shiprocket_tracking_events RENAME COLUMN remarks TO activity;
  END IF;
END $$;

-- ============================================================
-- 8. shiprocket_tracking_events: Add missing columns
-- ============================================================
ALTER TABLE public.shiprocket_tracking_events
  ADD COLUMN IF NOT EXISTS sr_status_id integer;

ALTER TABLE public.shiprocket_tracking_events
  ADD COLUMN IF NOT EXISTS sr_status_label text;

-- ============================================================
-- 9. shiprocket_webhook_events: Rename awb_code → awb_number
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_webhook_events'
      AND column_name = 'awb_code'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shiprocket_webhook_events'
      AND column_name = 'awb_number'
  ) THEN
    ALTER TABLE public.shiprocket_webhook_events RENAME COLUMN awb_code TO awb_number;
  END IF;
END $$;

-- ============================================================
-- 10. shiprocket_webhook_events: Add missing columns
-- ============================================================
ALTER TABLE public.shiprocket_webhook_events
  ADD COLUMN IF NOT EXISTS sr_order_id bigint;

ALTER TABLE public.shiprocket_webhook_events
  ADD COLUMN IF NOT EXISTS current_status text;

ALTER TABLE public.shiprocket_webhook_events
  ADD COLUMN IF NOT EXISTS current_status_id integer;

-- ============================================================
-- 11. Recreate dedup indexes (from 20260402120000) with correct names
--     These may have failed if the columns didn't exist yet.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_tracking_events_dedup
  ON public.shiprocket_tracking_events (shipment_id, event_at, sr_status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_shiprocket_webhook_events_dedup
  ON public.shiprocket_webhook_events (awb_number, current_status_id);

-- Rebuild the awb webhook index to point to awb_number
-- (the old index idx_shiprocket_webhook_events_awb_created may reference old column)
CREATE INDEX IF NOT EXISTS idx_shiprocket_webhook_events_awb_number_created
  ON public.shiprocket_webhook_events (awb_number, created_at DESC);

COMMIT;
