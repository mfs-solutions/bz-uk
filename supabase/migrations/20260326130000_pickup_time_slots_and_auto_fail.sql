-- ============================================================
-- pickup_time_slots: Configurable pickup time windows for sellers
-- shiprocket_auto_failed: Flag on orders when auto-creation fails
-- ============================================================

-- 1. Create pickup_time_slots table
CREATE TABLE IF NOT EXISTS public.pickup_time_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: anyone can read active slots
ALTER TABLE public.pickup_time_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active pickup time slots"
  ON public.pickup_time_slots
  FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Admin can manage pickup time slots"
  ON public.pickup_time_slots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 2. Seed default pickup time slots
INSERT INTO public.pickup_time_slots (label, start_time, end_time, sort_order)
VALUES
  ('Morning (9 AM – 12 PM)',   '09:00', '12:00', 1),
  ('Afternoon (12 PM – 3 PM)', '12:00', '15:00', 2),
  ('Late Afternoon (3 PM – 6 PM)', '15:00', '18:00', 3),
  ('Evening (6 PM – 9 PM)',    '18:00', '21:00', 4)
ON CONFLICT DO NOTHING;

-- 3. Add shiprocket_auto_failed column to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shiprocket_auto_failed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.orders.shiprocket_auto_failed IS 'True if automatic Shiprocket order creation failed after payment. Admin should investigate.';
