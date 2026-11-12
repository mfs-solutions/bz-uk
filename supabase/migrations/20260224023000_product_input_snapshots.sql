-- Persist full seller product wizard inputs (all fields) for audit/recovery

-- 1) Ensure domestic shipping can store flat delivery days from UI
ALTER TABLE IF EXISTS public.product_domestic_shipping
  ADD COLUMN IF NOT EXISTS expected_delivery_days integer DEFAULT 0;

-- 2) Snapshot table to store every wizard input without loss
CREATE TABLE IF NOT EXISTS public.product_input_snapshots (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  basic_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  media jsonb NOT NULL DEFAULT '{}'::jsonb,
  product_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  domestic_shipping jsonb NOT NULL DEFAULT '{}'::jsonb,
  international_shipping jsonb NOT NULL DEFAULT '{}'::jsonb,
  offers jsonb NOT NULL DEFAULT '{}'::jsonb,
  tax_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_input_snapshots_seller
  ON public.product_input_snapshots (seller_id, updated_at DESC);

ALTER TABLE public.product_input_snapshots ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON TABLE public.product_input_snapshots TO authenticated;

CREATE POLICY product_input_snapshots_select_own
  ON public.product_input_snapshots FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY product_input_snapshots_insert_own
  ON public.product_input_snapshots FOR INSERT TO authenticated
  WITH CHECK (seller_id = auth.uid());

CREATE POLICY product_input_snapshots_update_own
  ON public.product_input_snapshots FOR UPDATE TO authenticated
  USING (seller_id = auth.uid())
  WITH CHECK (seller_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_product_input_snapshots_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_input_snapshots_updated_at ON public.product_input_snapshots;
CREATE TRIGGER trg_product_input_snapshots_updated_at
BEFORE UPDATE ON public.product_input_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.set_product_input_snapshots_updated_at();
