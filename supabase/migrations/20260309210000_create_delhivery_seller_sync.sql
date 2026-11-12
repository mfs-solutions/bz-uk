-- Delhivery seller auto-sync tracking table
CREATE TABLE IF NOT EXISTS public.delhivery_seller_sync (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delhivery_warehouse_name text,
  sync_data jsonb DEFAULT '{}',
  last_synced_at timestamptz,
  sync_status text DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error')),
  sync_error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT delhivery_seller_sync_seller_id_key UNIQUE (seller_id)
);

ALTER TABLE public.delhivery_seller_sync ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own sync data"
  ON public.delhivery_seller_sync
  FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can insert own sync data"
  ON public.delhivery_seller_sync
  FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update own sync data"
  ON public.delhivery_seller_sync
  FOR UPDATE
  USING (auth.uid() = seller_id);

-- Add Delhivery as an international courier type if not already present
INSERT INTO public.international_courier_type (name)
SELECT 'Delhivery Cross Border Express'
WHERE NOT EXISTS (
  SELECT 1 FROM public.international_courier_type
  WHERE LOWER(name) LIKE '%delhivery%'
);
