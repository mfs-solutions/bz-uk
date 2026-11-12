CREATE TABLE IF NOT EXISTS public.delhivery_seller_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delhivery_warehouse_name text,
  sync_data jsonb DEFAULT '{}',
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error')),
  sync_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delhivery_seller_sync_events_seller_created
  ON public.delhivery_seller_sync_events (seller_id, created_at DESC);

ALTER TABLE public.delhivery_seller_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own sync events"
  ON public.delhivery_seller_sync_events FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can insert own sync events"
  ON public.delhivery_seller_sync_events FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

GRANT SELECT, INSERT ON public.delhivery_seller_sync_events TO authenticated;
