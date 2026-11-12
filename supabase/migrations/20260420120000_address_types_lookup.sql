-- Address types lookup table (Home, Work, Warehouse, Other)
CREATE TABLE IF NOT EXISTS public.address_types (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name       text        NOT NULL UNIQUE,
  slug       text        NOT NULL UNIQUE,
  sort_order int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.address_types (name, slug, sort_order) VALUES
  ('Home',      'home',      1),
  ('Work',      'work',      2),
  ('Warehouse', 'warehouse', 3),
  ('Other',     'other',     4)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.address_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY address_types_read
  ON public.address_types FOR SELECT
  TO authenticated, anon
  USING (true);

GRANT SELECT ON public.address_types TO authenticated, anon;
